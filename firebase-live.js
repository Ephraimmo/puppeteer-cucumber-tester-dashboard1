// Live browser view, agent side: gets the frames the test browser draws to every dashboard
// that is watching. dashboard-server.js (running in this same process) emits each frame; this
// module delivers it one of two ways:
//
//   Direct - a WebRTC data channel from this machine straight to the dashboard's browser.
//            Firebase only carries the handshake (live/signals); the pictures never touch it,
//            so they arrive as fast as the network between the two machines allows, and they
//            cost no database traffic.
//   Relay  - the frame is written to live/frame in the Realtime Database and every watching
//            dashboard reads it from there. Slower (it goes through Google's servers and back),
//            but it works wherever Firebase does, e.g. behind a firewall that blocks UDP.
//
// A dashboard starts on the relay and is moved to a direct connection as soon as that is up
// (and back, if it drops). It announces itself under live/viewers, which Firebase clears when
// its tab closes. While nobody is watching, the test browser isn't asked for frames at all.
//
// Direct connections need the optional node-datachannel package (npm install). Without it,
// or with LIVE_DIRECT=0 in the environment, every dashboard simply stays on the relay.
'use strict';

var RTCPeerConnection = null;
var directUnavailable = null;
try { RTCPeerConnection = require('node-datachannel/polyfill').RTCPeerConnection; }
catch (error) { directUnavailable = error.message.split('\n')[0]; }
if (process.env.LIVE_DIRECT === '0') {
    RTCPeerConnection = null;
    directUnavailable = 'turned off with LIVE_DIRECT=0';
}

var ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

// What the test browser is asked to produce (see runtime/live-view.js). Relay frames are kept
// small and infrequent because each one is uploaded and then downloaded again by every viewer.
var PROFILE_NONE = { fps: 0 };
var PROFILE_RELAY = { fps: 8, quality: 45, maxWidth: 1280, maxHeight: 800 };
var PROFILE_DIRECT = { fps: 20, quality: 60, maxWidth: 1440, maxHeight: 900 };

// Frames are never queued behind each other: a new one is sent only while fewer than this many
// are unacknowledged, and otherwise the newest frame waits (replacing an older waiting one), so
// a slow network costs frame rate and never adds delay.
var DIRECT_WINDOW = 2;
var RELAY_WINDOW = 4;
var RELAY_MIN_INTERVAL_MS = 100;
// frames are cut into messages of this size so none comes near the data channel's size limit
var CHUNK_BYTES = 60 * 1024;
var DIRECT_SETUP_TIMEOUT_MS = 20000;
var ACK_TIMEOUT_MS = 4000;
var STATS_INTERVAL_MS = 1000;

function noop() {}

// Realtime Database rejects undefined values; a JSON round trip drops them
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function log(message) {
    console.log('Firebase agent: live view — ' + message);
}

// The live view is best-effort. Its handlers run inside dashboard-server.js and Firebase callbacks,
// where an exception would take the whole agent down, so a failure here is reported and dropped.
function guarded(name, handler) {
    return function () {
        try { handler.apply(null, arguments); }
        catch (error) { log(name + ' failed: ' + error.message); }
    };
}

/**
 * Starts delivering live frames.
 * @param {object} db - the signed-in Firebase Realtime Database
 * @param {string} agentId - this agent's id (the namespace of every database path)
 * @param {object} live - the `live` export of dashboard-server.js
 * @returns {void}
 */
exports.start = function start(db, agentId, live) {
    var base = 'agents/' + agentId + '/live';
    var epoch = Date.now();    // tells dashboards a frame is from this run of the agent, whatever its number
    var viewers = {};          // id of each dashboard watching -> its live/viewers entry
    var peers = {};            // handshake id -> direct connection
    var relay = { active: false, inflight: 0, latest: null, lastAt: 0, timer: null };
    var packed = { seq: -1, chunks: null };
    var profile = null;

    // start clean: anything left from a previous agent session would look like a live run
    db.ref(base + '/frame').remove();
    db.ref(base + '/step').remove();
    db.ref(base + '/signals').remove();
    // Firebase runs an onDisconnect action on its server whenever this agent's connection drops,
    // even for a moment, and the SDK then reconnects by itself without redoing anything. So the
    // flag that says "direct connections work" is set up again every time the connection comes
    // back, not just once, or one network blip would switch the feature off until a restart.
    var directRef = db.ref(base + '/direct');
    db.ref('.info/connected').on('value', function (snapshot) {
        if (snapshot.val() !== true) return;
        directRef.onDisconnect().set(false)
            .then(function () { return directRef.set(!!RTCPeerConnection); })
            .catch(noop);
    });
    if (!RTCPeerConnection) log('direct connections unavailable (' + directUnavailable + '); dashboards will use the Firebase relay');

    /* ---------------- what to ask the test browser for ---------------- */

    // a dashboard is served by the relay until it has a direct connection that is delivering
    function relayNeeded() {
        var served = {};
        Object.keys(peers).forEach(function (id) { if (peers[id].healthy) served[peers[id].viewer] = true; });
        return Object.keys(viewers).some(function (id) { return !served[id]; });
    }

    function updateDemand() {
        var wanted = !Object.keys(viewers).length ? PROFILE_NONE : relayNeeded() ? PROFILE_RELAY : PROFILE_DIRECT;
        relay.active = wanted === PROFILE_RELAY;
        if (!relay.active) relay.latest = null;
        if (wanted === profile) return;
        profile = wanted;
        live.setDemand(wanted);
        if (relay.active) {
            // a dashboard that just arrived (or lost its direct connection) shouldn't wait for the next repaint
            var current = live.frame();
            if (current) offerToRelay(current);
            publishRelayStep();
        }
    }

    /* ---------------- relay ---------------- */

    function pumpRelay() {
        if (!relay.active || !relay.latest || relay.inflight >= RELAY_WINDOW) return;
        var wait = relay.lastAt + RELAY_MIN_INTERVAL_MS - Date.now();
        if (wait > 0) {
            if (!relay.timer) relay.timer = setTimeout(function () { relay.timer = null; pumpRelay(); }, wait);
            return;
        }
        var frame = relay.latest;
        relay.latest = null;
        relay.lastAt = Date.now();
        relay.inflight += 1;
        db.ref(base + '/frame').set({ data: frame.jpeg.toString('base64'), url: frame.url || '', t: frame.t, at: frame.at, n: frame.seq, e: epoch })
            .catch(noop) // transient — the next frame replaces it
            .then(function () { relay.inflight -= 1; pumpRelay(); });
    }

    function offerToRelay(frame) {
        if (!relay.active) return;
        relay.latest = frame;
        pumpRelay();
    }

    function publishRelayStep() {
        if (!relay.active) return;
        var step = live.step();
        db.ref(base + '/step').set(step.scenario || step.step ? { scenario: step.scenario || '', step: step.step || '', at: Date.now() } : null).catch(noop);
    }

    /* ---------------- direct connections ---------------- */

    // A frame travels as [u32 header length][header JSON][JPEG], cut into messages of
    // [u32 frame number][u16 index][u16 count][data]. Built once, whoever is watching.
    function chunksFor(frame) {
        if (packed.seq === frame.seq) return packed.chunks;
        var header = Buffer.from(JSON.stringify({ e: epoch, n: frame.seq, t: frame.t, url: frame.url || '' }));
        var length = Buffer.alloc(4);
        length.writeUInt32BE(header.length);
        var whole = Buffer.concat([length, header, frame.jpeg]);
        var count = Math.max(1, Math.ceil(whole.length / CHUNK_BYTES));
        var chunks = [];
        for (var i = 0; i < count; i++) {
            var head = Buffer.alloc(8);
            head.writeUInt32BE(frame.seq >>> 0, 0);
            head.writeUInt16BE(i, 4);
            head.writeUInt16BE(count, 6);
            chunks.push(Buffer.concat([head, whole.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)]));
        }
        packed = { seq: frame.seq, chunks: chunks };
        return chunks;
    }

    function sendText(peer, message) {
        if (!peer.open) return;
        try { peer.channel.send(JSON.stringify(message)); }
        catch (error) { closePeer(peer, 'send failed: ' + error.message); }
    }

    function sendFrame(peer, frame) {
        var now = Date.now();
        if (peer.inflight === 0) peer.unackedSince = now;
        peer.inflight += 1;
        try {
            chunksFor(frame).forEach(function (chunk) { peer.channel.send(chunk); });
        }
        catch (error) { closePeer(peer, 'send failed: ' + error.message); }
    }

    function offerToPeer(peer, frame) {
        if (!peer.open) return;
        if (peer.inflight >= DIRECT_WINDOW) {
            // a viewer that has stopped answering must not freeze the stream for good
            if (Date.now() - peer.unackedSince > ACK_TIMEOUT_MS) {
                peer.inflight = 0;
                if (peer.healthy) { peer.healthy = false; updateDemand(); }
            }
            else { peer.waiting = frame; return; }
        }
        sendFrame(peer, frame);
    }

    function onPeerMessage(peer, data) {
        var message;
        try { message = JSON.parse(String(data)); }
        catch (error) { return; }
        if (typeof message.pong === 'number') {
            // answered at once by the dashboard, so this is the network's round trip, not frame decoding time
            peer.rtt = Date.now() - message.pong;
            return;
        }
        if (typeof message.ack !== 'number') return;
        peer.inflight = Math.max(0, peer.inflight - 1);
        peer.unackedSince = peer.inflight ? Date.now() : 0;
        if (!peer.healthy) {
            // the dashboard has shown a direct frame: the relay can stop serving it
            peer.healthy = true;
            log('direct connection to a dashboard is delivering');
            updateDemand();
        }
        if (peer.waiting) {
            var waiting = peer.waiting;
            peer.waiting = null;
            offerToPeer(peer, waiting);
        }
    }

    function closePeer(peer, reason) {
        if (peer.closed) return;
        peer.closed = true;
        delete peers[peer.id];
        clearTimeout(peer.setupTimer);
        clearInterval(peer.statsTimer);
        peer.ref.child('viewerIce').off();
        try { peer.pc.close(); }
        catch (error) { /* already closed */ }
        peer.ref.remove().catch(noop);
        if (peer.opened) log('direct connection closed (' + reason + ')');
        else log('direct connection could not be set up (' + reason + '); that dashboard stays on the relay');
        updateDemand();
    }

    function wireChannel(peer, channel) {
        peer.channel = channel;
        function opened() {
            if (peer.open || peer.closed) return;
            peer.open = true;
            peer.opened = true;
            clearTimeout(peer.setupTimer);
            // the handshake is done, so its messages can go
            setTimeout(function () { peer.ref.remove().catch(noop); }, 3000);
            var step = live.step();
            sendText(peer, { type: 'step', scenario: step.scenario, step: step.step });
            var current = live.frame();
            if (current) offerToPeer(peer, current);
            // every second: a ping for the dashboard to answer, which also carries the last round trip to show
            peer.statsTimer = setInterval(function () { sendText(peer, { type: 'ping', at: Date.now(), rtt: peer.rtt }); }, STATS_INTERVAL_MS);
        }
        channel.onopen = opened;
        channel.onmessage = function (event) { onPeerMessage(peer, event.data); };
        channel.onclose = function () { closePeer(peer, 'the channel closed'); };
        channel.onerror = function () { closePeer(peer, 'the channel failed'); };
        if (channel.readyState === 'open') opened();
    }

    // A dashboard offers a connection by writing live/signals/<id> = { viewer, offer } in one
    // piece, before any of its ICE candidates; this answers it, and both sides then trade ICE
    // candidates under the same node.
    function acceptOffer(snapshot) {
        var attemptId = snapshot.key;
        var signal = snapshot.val();
        if (!signal || !signal.offer || !signal.viewer || peers[attemptId]) return;
        if (!RTCPeerConnection) return;

        var peer = {
            id: attemptId, viewer: signal.viewer, ref: snapshot.ref, pc: null, channel: null,
            open: false, opened: false, closed: false, healthy: false,
            inflight: 0, unackedSince: 0, waiting: null, rtt: 0, setupTimer: null, statsTimer: null
        };
        peers[attemptId] = peer;
        peer.setupTimer = setTimeout(function () { closePeer(peer, 'no connection within ' + DIRECT_SETUP_TIMEOUT_MS / 1000 + ' s'); }, DIRECT_SETUP_TIMEOUT_MS);

        try {
            var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            peer.pc = pc;
            pc.onicecandidate = function (event) {
                if (event.candidate) peer.ref.child('agentIce').push(plain(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate)).catch(noop);
            };
            pc.ondatachannel = function (event) { wireChannel(peer, event.channel); };
            pc.onconnectionstatechange = function () {
                if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(peer, 'the connection ' + pc.connectionState);
            };
            pc.setRemoteDescription(signal.offer)
                .then(function () { return pc.createAnswer(); })
                .then(function (answer) { return pc.setLocalDescription(answer).then(function () { return answer; }); })
                .then(function (answer) { return peer.ref.child('answer').set({ type: answer.type, sdp: answer.sdp }); })
                .then(function () {
                    // only now: a candidate can't be added before the remote description is set
                    peer.ref.child('viewerIce').on('child_added', function (candidate) {
                        var value = candidate.val();
                        if (value && value.candidate && !peer.closed) pc.addIceCandidate(value).catch(noop);
                    });
                })
                .catch(function (error) { closePeer(peer, error.message); });
        }
        catch (error) { closePeer(peer, error.message); }
    }

    var signalsRef = db.ref(base + '/signals');
    signalsRef.on('child_added', guarded('answering a connection offer', acceptOffer));

    /* ---------------- who is watching, and what the browser draws ---------------- */

    db.ref(base + '/viewers').on('value', guarded('tracking who is watching', function (snapshot) {
        viewers = snapshot.val() || {};
        Object.keys(peers).forEach(function (id) {
            if (!viewers[peers[id].viewer]) closePeer(peers[id], 'the dashboard went away');
        });
        updateDemand();
    }));

    live.events.on('frame', guarded('sending a frame', function (frame) {
        Object.keys(peers).forEach(function (id) { offerToPeer(peers[id], frame); });
        offerToRelay(frame);
    }));

    live.events.on('step', guarded('sending the current step', function (step) {
        Object.keys(peers).forEach(function (id) { sendText(peers[id], { type: 'step', scenario: step.scenario, step: step.step }); });
        publishRelayStep();
    }));

    live.events.on('end', guarded('ending the live view', function () {
        relay.latest = null;
        packed = { seq: -1, chunks: null };
        db.ref(base + '/frame').remove().catch(noop);
        db.ref(base + '/step').remove().catch(noop);
        Object.keys(peers).forEach(function (id) { peers[id].waiting = null; sendText(peers[id], { type: 'end' }); });
    }));
};
