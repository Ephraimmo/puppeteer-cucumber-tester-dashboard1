/**
 * live-view.js streams what the test browser is showing to dashboard-server.js, which hands
 * it to firebase-agent.js for the dashboard's live view. It uses Chrome's screencast (JPEG
 * frames, only sent when the page actually repaints) and passes each frame, as raw bytes,
 * over the IPC channel dashboard-server.js opens when it spawns this runner.
 *
 * dashboard-server.js says how much to send with a 'liveDemand' message (see onMessage):
 * nothing while no dashboard is watching, a lighter stream for viewers on the Firebase
 * relay, a sharper and faster one for viewers on a direct connection. The runner also
 * reports the current scenario and step as they change, so the live view's caption moves
 * together with the picture instead of trailing it.
 *
 * A plain `node index.js` run has no IPC channel, so everything here is a no-op then.
 * Live view is best-effort: errors are swallowed so it can never fail a test.
 */

var progress = require('./progress.js');

// how often to check whether the tests have pointed global.page at another tab
var FOLLOW_INTERVAL_MS = 100;
var CAPTURE_TIMEOUT_MS = 2000;
// frames handed to the IPC channel but not yet written: past this the parent is behind, and
// queueing more frames would only add delay, so they are dropped instead
var MAX_UNSENT_FRAMES = 3;

var enabled = typeof process.send === 'function';
// what the parent wants; until it says otherwise nobody is watching, so nothing is captured
var demand = { fps: 0, quality: 50, maxWidth: 1280, maxHeight: 800 };
var session = null;
var watchedPage = null;
var watchedProfile = '';
var syncing = false;
var followTimer = null;
var unsent = 0;
var nextAckAt = 0;
var lastCaption = '';

function profileKey() {
    return demand.quality + '/' + demand.maxWidth + 'x' + demand.maxHeight;
}

// the tab that should be streaming right now, or null when nobody is watching
function wantedPage() {
    return (demand.fps > 0 && global.page) || null;
}

function sendFrame(page, base64, capturedAt) {
    if (!enabled || !process.connected || unsent >= MAX_UNSENT_FRAMES) return;
    unsent += 1;
    try {
        process.send({ type: 'liveFrame', jpeg: Buffer.from(base64, 'base64'), url: page.url(), t: capturedAt }, function () { unsent -= 1; });
    }
    catch (error) { unsent -= 1; /* dashboard-server went away — nothing to stream to */ }
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (resolve, reject) {
        setTimeout(function () { reject(new Error('timed out')); }, ms).unref();
    })]);
}

function onScreencastFrame(client, page, frame) {
    var now = Date.now();
    var capturedAt = frame.metadata && frame.metadata.timestamp ? frame.metadata.timestamp * 1000 : now;
    // a clock that disagrees with this machine's would make the picture look hours old
    if (Math.abs(now - capturedAt) > 5000) capturedAt = now;
    sendFrame(page, frame.data, capturedAt);

    // Chrome sends the next frame only after a frame has been acknowledged (and keeps up to two
    // unacknowledged ones in flight), so spacing the acks out caps the frame rate without making
    // Chrome encode frames nobody will see. The spacing is on a fixed grid, not relative to when
    // each frame arrived, or the two frames in flight would be released together.
    var interval = demand.fps > 0 ? 1000 / demand.fps : 0;
    var due = Math.max(now, nextAckAt);
    nextAckAt = due + interval;
    function ack() {
        client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(function () {});
    }
    if (due - now > 1) setTimeout(ack, due - now);
    else ack();
}

async function detach() {
    var client = session;
    session = null;
    watchedPage = null;
    watchedProfile = '';
    if (!client) return;
    try {
        await client.send('Page.stopScreencast');
        await client.detach();
    }
    catch (error) { /* the browser was already closed by teardown */ }
}

async function attach(page) {
    watchedPage = page;
    watchedProfile = profileKey();
    try {
        var client = await page.target().createCDPSession();
        var gotFrame = false;
        session = client;
        nextAckAt = 0;
        client.on('Page.screencastFrame', function (frame) {
            gotFrame = true;
            onScreencastFrame(client, page, frame);
        });
        await client.send('Page.startScreencast', { format: 'jpeg', quality: demand.quality, maxWidth: demand.maxWidth, maxHeight: demand.maxHeight });

        // A page that has finished painting sends no screencast frames until something changes,
        // so show its current state straight away. This must not hold up following the tests to
        // another tab (a background tab in a windowed browser may not answer until it is brought
        // to the front), so it runs on its own and is dropped if a real frame got there first.
        withTimeout(client.send('Page.captureScreenshot', { format: 'jpeg', quality: demand.quality }), CAPTURE_TIMEOUT_MS)
            .then(function (shot) { if (session === client && !gotFrame) sendFrame(page, shot.data, Date.now()); })
            .catch(function () {});
    }
    catch (error) { /* best-effort — see file header */ }
}

async function sync() {
    var page = wantedPage();
    if (page === watchedPage && (!page || profileKey() === watchedProfile)) return;
    await detach();
    if (page) await attach(page);
}

// Starts, stops or restarts the screencast when what is wanted differs from what is running:
// another tab, another quality/size, or nobody watching any more.
function tick() {
    if (syncing) return;
    var page = wantedPage();
    if (page === watchedPage && (!page || profileKey() === watchedProfile)) return;
    syncing = true;
    sync().then(function () { syncing = false; }, function () { syncing = false; });
}

function clamp(value, min, max, fallback) {
    var number = Number(value);
    return isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function onMessage(message) {
    if (!message || message.type !== 'liveDemand') return;
    demand = {
        fps: clamp(message.fps, 0, 60, 0),
        quality: clamp(message.quality, 10, 95, demand.quality),
        maxWidth: clamp(message.maxWidth, 160, 3840, demand.maxWidth),
        maxHeight: clamp(message.maxHeight, 100, 2160, demand.maxHeight)
    };
    tick();
}

if (enabled) {
    process.on('message', onMessage);
    // Don't let the IPC channel keep the runner alive once cucumber is done. This has to come
    // after the 'message' listener above, because adding a listener references the channel again.
    if (process.channel && typeof process.channel.unref === 'function') {
        process.channel.unref();
    }

    progress.onChange(function (state) {
        var scenario = state.current || null;
        var step = state.currentStep || null;
        var caption = scenario + '\n' + step;
        if (caption === lastCaption || !process.connected) return;
        lastCaption = caption;
        try { process.send({ type: 'liveStep', scenario: scenario, step: step }); }
        catch (error) { /* dashboard-server went away */ }
    });
}

/**
 * Starts streaming global.page (when a dashboard is watching), and keeps following it
 * whenever the tests switch it to another tab (e.g. helpers.openPage opens a new one).
 * Safe to call repeatedly.
 * @returns {void}
 */
function follow() {
    if (!enabled || followTimer) return;
    followTimer = setInterval(tick, FOLLOW_INTERVAL_MS);
    followTimer.unref();
    tick();
}

module.exports = {
    follow: follow
};
