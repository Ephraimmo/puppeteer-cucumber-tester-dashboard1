'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var childProcess = require('child_process');

var root = __dirname;
var port = process.env.PORT || 4173;
var dashboardUrl = 'http://localhost:' + port;

function pingDashboard(callback) {
    var req = http.get(dashboardUrl + '/api/env', function (res) {
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

function ensureDependencies() {
    if (fs.existsSync(path.join(root, 'node_modules'))) {
        return;
    }
    console.log('First run detected — installing dependencies (one time)...');
    childProcess.execSync('npm install', { cwd: root, stdio: 'inherit', env: process.env });
}

function startDashboard() {
    console.log('');
    console.log('  Scenario Test Dashboard');
    console.log('  -----------------------');
    console.log('  Dashboard: ' + dashboardUrl);
    console.log('');
    console.log('  Keep this window open while testing.');
    console.log('  In the browser: select Windowed, then click Run to watch Chrome.');
    console.log('  Close this window to stop the dashboard.');
    console.log('');

    var child = childProcess.spawn(process.execPath, [path.join(root, 'dashboard-server.js'), '--open'], {
        cwd: root,
        stdio: 'inherit',
        env: process.env
    });
    child.on('exit', function (code) {
        process.exit(typeof code === 'number' ? code : 0);
    });
}

ensureDependencies();
pingDashboard(function (alreadyRunning) {
    if (alreadyRunning) {
        console.log('Dashboard already running — opening ' + dashboardUrl);
        openBrowser(dashboardUrl);
        return;
    }
    startDashboard();
});
