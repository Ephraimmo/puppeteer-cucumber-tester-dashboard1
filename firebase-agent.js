// Firebase bridge for the local dashboard.
//
// This process does two things:
//   1. Boots the EXISTING dashboard-server.js exactly as before (unchanged) — it still
//      owns every bit of real work: reading/writing feature files, running cucumber,
//      launching Puppeteer for recording.
//   2. Signs into Firebase and relays commands that arrive in the Realtime Database
//      (written by a dashboard opened on ANY computer) into plain HTTP calls against
//      this same local server — i.e. it does exactly what a browser's `fetch('/api/...')`
//      used to do — then mirrors the results, and a handful of live-updating endpoints
//      (progress, run status, features, step definitions), back into the database.
//
// Run with `npm run agent` (or `node firebase-agent.js`). See FIREBASE_SETUP.md for the
// one-time Firebase console steps this depends on.
'use strict';

var firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/database');
var fs = require('fs');
var path = require('path');

var firebaseConfig = require('./firebase-agent-config');
var AGENT_ID = firebaseConfig.AGENT_ID;
var LOCAL_PORT = process.env.PORT || 4173;
var LOCAL_BASE = 'http://localhost:' + LOCAL_PORT;
var MIRROR_INTERVAL_MS = 1200;
var RECORDING_POLL_MS = 400;
var ERROR_LOG = path.join(__dirname, 'firebase-agent-errors.log');

// This process runs unattended, often with nobody watching its console, so record why it
// failed in a file. A rejected promise (e.g. one Firebase write failing) is logged and the
// agent keeps going; a real crash is logged and then exits as before.
function logAgentError(kind, error) {
    var detail = (error && error.stack) || String(error);
    console.error('Firebase agent: ' + kind + ': ' + detail);
    try { fs.appendFileSync(ERROR_LOG, new Date().toISOString() + ' ' + kind + ': ' + detail + '\n'); }
    catch (writeError) { /* nowhere else to report it */ }
}
process.on('unhandledRejection', function (reason) { logAgentError('unhandled rejection', reason); });
process.on('uncaughtException', function (error) { logAgentError('crash', error); process.exit(1); });

// Starts the local HTTP server (file I/O, the cucumber runner, puppeteer recording) in
// this same process — see the file header above for why nothing about it needs to change.
var dashboardServer = require('./dashboard-server.js');
var firebaseLive = require('./firebase-live');

function loadCredentials() {
    if (process.env.FIREBASE_AGENT_EMAIL && process.env.FIREBASE_AGENT_PASSWORD) {
        return { email: process.env.FIREBASE_AGENT_EMAIL, password: process.env.FIREBASE_AGENT_PASSWORD };
    }
    var credPath = path.join(__dirname, 'firebase-agent-credentials.json');
    if (fs.existsSync(credPath)) {
        try {
            var parsed = JSON.parse(fs.readFileSync(credPath, 'utf8'));
            if (parsed.email && parsed.password) return parsed;
        }
        catch (error) { /* fall through to the instructions below */ }
    }
    console.error('\nFirebase agent: no sign-in credentials found.');
    console.error('Set FIREBASE_AGENT_EMAIL / FIREBASE_AGENT_PASSWORD environment variables, or create');
    console.error(path.join(__dirname, 'firebase-agent-credentials.json') + ':');
    console.error('  { "email": "you@example.com", "password": "yourpassword" }');
    console.error('(that file is already listed in .gitignore, so it is never committed)');
    console.error('See FIREBASE_SETUP.md for how to create this account in the Firebase console.\n');
    process.exit(1);
    return null;
}

var credentials = loadCredentials();
firebase.initializeApp(firebaseConfig);

var db = null;
var lastMirrorJson = {};
var activeRecordingSessionId = null;
var recordingSince = 0;
var recordingEventsAccum = [];
var recordingPollTimer = null;

function httpRequest(method, urlPath, bodyObj) {
    var options = { method: method, headers: {} };
    if (bodyObj !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(bodyObj);
    }
    return fetch(LOCAL_BASE + urlPath, options).then(function (response) {
        return response.text().then(function (text) {
            var parsed = null;
            try { parsed = text ? JSON.parse(text) : null; }
            catch (error) { /* a 404's plain-text "Not found" body, etc. — leave parsed null */ }
            return { ok: response.ok, status: response.status, body: parsed };
        });
    });
}

// Strips embedded screenshots (base64 images) out of a cucumber report before mirroring
// it to Firebase — keeps the Realtime Database small and fast. Screenshots stay visible
// only when the dashboard is viewed directly on this machine (see FIREBASE_SETUP.md).
function stripReportScreenshots(report) {
    if (!Array.isArray(report)) return report;
    return report.map(function (feature) {
        var clone = Object.assign({}, feature);
        clone.elements = (feature.elements || []).map(function (scenario) {
            var scenarioClone = Object.assign({}, scenario);
            scenarioClone.steps = (scenario.steps || []).map(function (step) {
                if (!step || !step.embeddings) return step;
                var stepClone = Object.assign({}, step);
                delete stepClone.embeddings;
                return stepClone;
            });
            return scenarioClone;
        });
        return clone;
    });
}

// Realtime Database has no concept of "only write if changed", so we track the last
// JSON we sent per path ourselves — avoids flooding the database with identical writes
// every mirror tick when nothing actually changed.
function mirror(name, dbPath, value) {
    var json = JSON.stringify(value === undefined ? null : value);
    if (lastMirrorJson[name] === json) return Promise.resolve();
    lastMirrorJson[name] = json;
    return db.ref(dbPath).set(value === undefined ? null : value);
}

function runMirrorTick() {
    Promise.all([
        httpRequest('GET', '/api/progress').then(function (r) { return mirror('progress', 'runs/' + AGENT_ID + '/progress', r.body); }),
        httpRequest('GET', '/api/run-status').then(function (r) { return mirror('runStatus', 'runs/' + AGENT_ID + '/status', r.body); }),
        httpRequest('GET', '/api/features').then(function (r) { return mirror('features', 'features/' + AGENT_ID, { files: r.body, updatedAt: Date.now() }); }),
        httpRequest('GET', '/api/step-definitions').then(function (r) { return mirror('stepDefs', 'stepDefinitions/' + AGENT_ID, { files: (r.body && r.body.files) || [], steps: (r.body && r.body.steps) || [], updatedAt: Date.now() }); }),
        httpRequest('GET', '/api/step-suggestions').then(function (r) { return mirror('stepSuggestions', 'agents/' + AGENT_ID + '/stepSuggestions', r.body); }),
        httpRequest('GET', '/api/env').then(function (r) { return mirror('env', 'agents/' + AGENT_ID + '/env', r.body); }),
        httpRequest('GET', '/api/report').then(function (r) { return mirror('report', 'reports/' + AGENT_ID, { report: stripReportScreenshots(r.body), updatedAt: Date.now() }); })
    ]).catch(function (error) {
        console.error('Firebase agent: mirror tick failed:', error.message);
    });
}

function stopRecordingPoll() {
    if (recordingPollTimer) { clearInterval(recordingPollTimer); recordingPollTimer = null; }
}

function startRecordingPoll() {
    stopRecordingPoll();
    recordingPollTimer = setInterval(function () {
        if (!activeRecordingSessionId) return;
        httpRequest('GET', '/api/record/events?sessionId=' + encodeURIComponent(activeRecordingSessionId) + '&since=' + recordingSince)
            .then(function (r) {
                if (!r.ok || !r.body) return;
                recordingEventsAccum = recordingEventsAccum.concat(r.body.events || []);
                recordingSince = r.body.total || recordingSince;
                db.ref('recording/' + AGENT_ID + '/session').set({
                    sessionId: activeRecordingSessionId,
                    events: recordingEventsAccum,
                    closed: !!r.body.closed,
                    error: r.body.error || null,
                    updatedAt: Date.now()
                });
                if (r.body.closed) {
                    activeRecordingSessionId = null;
                    stopRecordingPoll();
                }
            })
            .catch(function () { /* transient — next tick retries */ });
    }, RECORDING_POLL_MS);
}

// Translates one queued command into the equivalent local HTTP call(s) — the exact same
// requests the browser dashboard used to make directly against dashboard-server.js.
function dispatchCommand(type, payload) {
    payload = payload || {};
    switch (type) {
        case 'run':
            return httpRequest('POST', '/api/run', { tag: payload.tag || '', featureFile: payload.featureFile || '', headless: payload.headless !== false });
        case 'stop':
            return httpRequest('POST', '/api/stop', {});
        case 'saveFeature':
            return httpRequest('POST', '/api/feature', payload);
        case 'deleteFeature':
            return httpRequest('DELETE', '/api/feature?file=' + encodeURIComponent(payload.file || ''));
        case 'createFolder':
            return httpRequest('POST', '/api/folder', { path: payload.path });
        case 'deleteFolder':
            return httpRequest('DELETE', '/api/folder?path=' + encodeURIComponent(payload.path || ''));
        case 'saveStepDefinition':
            return httpRequest('POST', '/api/step-definition', payload);
        case 'updateStepDefinition':
            return httpRequest('PUT', '/api/step-definition', payload);
        case 'startRecording':
            return httpRequest('POST', '/api/record/start', { url: payload.url }).then(function (r) {
                if (r.ok && r.body && r.body.sessionId) {
                    activeRecordingSessionId = r.body.sessionId;
                    recordingSince = 0;
                    recordingEventsAccum = [];
                    db.ref('recording/' + AGENT_ID + '/session').set({ sessionId: r.body.sessionId, events: [], closed: false, error: null, updatedAt: Date.now() });
                    startRecordingPoll();
                }
                return r;
            });
        case 'requestRecordStep':
            return httpRequest('POST', '/api/record/request-step', { sessionId: payload.sessionId, eventIndex: payload.eventIndex });
        case 'stopRecording':
            return httpRequest('POST', '/api/record/stop', { sessionId: payload.sessionId }).then(function (r) {
                stopRecordingPoll();
                activeRecordingSessionId = null;
                return r;
            });
        default:
            return Promise.resolve({ ok: false, status: 400, body: { message: 'Unknown command type: ' + type } });
    }
}

function listenForCommands() {
    db.ref('commands/' + AGENT_ID).on('child_added', function (snapshot) {
        var command = snapshot.val();
        if (!command || command.status !== 'pending') return; // already handled (e.g. agent restarted mid-queue)
        dispatchCommand(command.type, command.payload)
            .then(function (result) {
                return snapshot.ref.update({
                    status: result.ok ? 'done' : 'error',
                    statusCode: result.status,
                    result: result.body,
                    message: (result.body && result.body.message) || null,
                    completedAt: Date.now()
                });
            })
            .catch(function (error) {
                return snapshot.ref.update({ status: 'error', message: error.message, completedAt: Date.now() });
            });
    });
}

console.log('Firebase agent: signing in...');
firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password)
    .then(function () {
        console.log('Firebase agent: signed in as ' + credentials.email + ' (agent id "' + AGENT_ID + '")');
        db = firebase.database();
        return db.ref('agents/' + AGENT_ID + '/status').set({
            online: true, startedAt: Date.now(), lastSeen: Date.now(), platform: process.platform, node: process.version
        });
    })
    .then(function () {
        listenForCommands();
        firebaseLive.start(db, AGENT_ID, dashboardServer.live);
        runMirrorTick();
        setInterval(runMirrorTick, MIRROR_INTERVAL_MS);
        setInterval(function () { db.ref('agents/' + AGENT_ID + '/status/lastSeen').set(Date.now()); }, 5000);
        console.log('Firebase agent: connected — watching commands/' + AGENT_ID + ' for work from any dashboard.');
    })
    .catch(function (error) {
        console.error('Firebase agent: sign-in failed:', error.message);
        console.error('Check that Email/Password sign-in is enabled and this account exists — see FIREBASE_SETUP.md.');
        process.exit(1);
    });

function markOfflineAndExit() {
    if (!db) { process.exit(0); return; }
    db.ref('agents/' + AGENT_ID + '/status/online').set(false).catch(function () {}).then(function () { process.exit(0); });
}
process.on('SIGINT', markOfflineAndExit);
process.on('SIGTERM', markOfflineAndExit);
