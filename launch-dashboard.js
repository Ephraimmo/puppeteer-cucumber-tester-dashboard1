'use strict';

// `npm start` / start.bat: starts the Firebase agent (which runs the tests for the
// hosted dashboard) and opens that dashboard. The dashboard itself is the separate
// puppeteer-dashboard-web project; this machine no longer serves a page.
var fs = require('fs');
var path = require('path');
var http = require('http');
var childProcess = require('child_process');

var root = __dirname;
var port = process.env.PORT || 4173;
var localApiUrl = 'http://localhost:' + port;
var dashboardUrl = require('./firebase-agent-config').DASHBOARD_URL;

function pingAgent(callback) {
    var req = http.get(localApiUrl + '/api/env', function (res) {
        res.resume();
        callback(res.statusCode === 200);
    });
    req.on('error', function () {
        callback(false);
    });
    req.setTimeout(2000, function () {
        req.destroy();
        callback(false);
    });
}

function openBrowser(url) {
    if (process.platform === 'win32') {
        childProcess.spawn('cmd', ['/s', '/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    else if (process.platform === 'darwin') {
        childProcess.spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    else {
        childProcess.spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
}

function openDashboard() {
    if (!dashboardUrl) {
        console.log('  Set DASHBOARD_URL in firebase-agent-config.js to your Vercel URL to have it opened automatically.');
        return;
    }
    openBrowser(dashboardUrl);
}

function ensureDependencies() {
    if (fs.existsSync(path.join(root, 'node_modules'))) {
        return;
    }
    console.log('First run detected — installing dependencies (one time)...');
    childProcess.execSync('npm install', { cwd: root, stdio: 'inherit', env: process.env });
}

function startAgent() {
    console.log('');
    console.log('  Scenario Test Agent');
    console.log('  -------------------');
    console.log('  Dashboard: ' + (dashboardUrl || '(not set — see firebase-agent-config.js)'));
    console.log('');
    console.log('  Keep this window open while testing — it runs the tests for the dashboard.');
    console.log('  In the browser: select Windowed, then click Run to watch Chrome.');
    console.log('  Close this window to stop the agent.');
    console.log('');

    var child = childProcess.spawn(process.execPath, [path.join(root, 'firebase-agent.js')], {
        cwd: root,
        stdio: 'inherit',
        env: process.env
    });
    child.on('exit', function (code) {
        process.exit(typeof code === 'number' ? code : 0);
    });
    openDashboard();
}

ensureDependencies();
pingAgent(function (alreadyRunning) {
    if (alreadyRunning) {
        console.log('Agent already running on port ' + port + '.');
        openDashboard();
        return;
    }
    startAgent();
});
