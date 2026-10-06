/**
 * live-view.js streams what the test browser is showing to dashboard-server.js, which hands
 * it to firebase-agent.js for the dashboard's "Live browser" panel. It uses Chrome's
 * screencast (JPEG frames, only sent when the page actually repaints) and passes each frame
 * over the IPC channel dashboard-server.js opens when it spawns this runner.
 *
 * A plain `node index.js` run has no IPC channel, so everything here is a no-op then.
 * Live view is best-effort: errors are swallowed so it can never fail a test.
 */

// Chrome only sends the next frame after the previous one is acknowledged, so delaying the
// ack caps the frame rate without making Chrome encode frames nobody will see.
var FRAME_INTERVAL_MS = 300;
// how often to check whether the tests have pointed global.page at another tab
var FOLLOW_INTERVAL_MS = 500;
var CAPTURE_TIMEOUT_MS = 2000;

var enabled = typeof process.send === 'function';
var session = null;
var watchedPage = null;
var followTimer = null;
var pending = Promise.resolve();

// don't let the IPC channel keep the runner alive once cucumber is done
if (enabled && process.channel && typeof process.channel.unref === 'function') {
    process.channel.unref();
}

function send(page, data) {
    if (!enabled || !process.connected) return;
    try { process.send({ type: 'liveFrame', data: data, url: page.url() }); }
    catch (error) { /* dashboard-server went away — nothing to stream to */ }
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (resolve, reject) {
        setTimeout(function () { reject(new Error('timed out')); }, ms).unref();
    })]);
}

async function detach() {
    var client = session;
    session = null;
    watchedPage = null;
    if (!client) return;
    try {
        await client.send('Page.stopScreencast');
        await client.detach();
    }
    catch (error) { /* the browser was already closed by teardown */ }
}

async function attach(page) {
    if (!page || page === watchedPage) return;
    await detach();
    watchedPage = page;
    try {
        var client = await page.target().createCDPSession();
        session = client;
        client.on('Page.screencastFrame', function (frame) {
            send(page, frame.data);
            setTimeout(function () {
                client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(function () {});
            }, FRAME_INTERVAL_MS);
        });
        await client.send('Page.startScreencast', { format: 'jpeg', quality: 50, maxWidth: 1280, maxHeight: 800 });

        // a page that has finished painting sends no screencast frames until something
        // changes, so show its current state straight away (timeout: a background tab in a
        // windowed browser may not answer until it's brought to the front)
        var shot = await withTimeout(client.send('Page.captureScreenshot', { format: 'jpeg', quality: 50 }), CAPTURE_TIMEOUT_MS);
        if (session === client) send(page, shot.data);
    }
    catch (error) { /* best-effort — see file header */ }
}

/**
 * Starts streaming global.page, and keeps following it whenever the tests switch it to
 * another tab (e.g. helpers.openPage opens a new one). Safe to call repeatedly.
 * @returns {void}
 */
function follow() {
    if (!enabled || followTimer) return;
    function tick() {
        // one attach at a time, so a slow attach can't race a newer one
        pending = pending.then(function () { return attach(global.page); });
    }
    tick();
    followTimer = setInterval(tick, FOLLOW_INTERVAL_MS);
    followTimer.unref();
}

module.exports = {
    follow: follow
};
