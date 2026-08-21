var http = require('http');
var fs = require('fs');
var path = require('path');
var gherkin = require('gherkin');
var childProcess = require('child_process');

var root = __dirname;
var reports = path.join(root, 'features', 'reports');
var port = process.env.PORT || 4173;
var activeRun = { status: 'idle', tag: null, requestedTag: null, startedAt: null, finishedAt: null, exitCode: null, message: 'Ready to run' };

function featureFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
        var entryPath = path.join(directory, entry.name);
        if (entry.isDirectory() && entry.name !== 'reports' && entry.name !== 'node_modules') {
            return files.concat(featureFiles(entryPath));
        }
        return entry.isFile() && entry.name.toLowerCase().endsWith('.feature') ? files.concat(entryPath) : files;
    }, []);
}

function readFeature(filePath) {
    try {
        var document = new gherkin.Parser().parse(fs.readFileSync(filePath, 'utf8'));
        var feature = document.feature;
        return {
            name: feature.name,
            description: feature.description || '',
            uri: path.relative(root, filePath).replace(/\\/g, '/'),
            tags: (feature.tags || []).map(function (tag) { return tag.name; }),
            elements: (feature.children || []).filter(function (child) { return child.type === 'Scenario' || child.type === 'ScenarioOutline'; }).map(function (scenario) {
                return {
                    keyword: scenario.keyword || 'Scenario',
                    name: scenario.name,
                    tags: (scenario.tags || []).map(function (tag) { return tag.name; }),
                    steps: (scenario.steps || []).map(function (step) { return { keyword: step.keyword || '', name: step.text || step.name || '' }; })
                };
            })
        };
    }
    catch (error) {
        return null;
    }
}

function discoverFeatures() {
    return featureFiles(path.join(root, 'features')).map(readFeature).filter(Boolean);
}

function safeFeaturePath(uri) {
    var normalized = String(uri || '').replace(/\\/g, '/');
    if (!normalized.toLowerCase().endsWith('.feature') || normalized.indexOf('..') >= 0 || path.isAbsolute(normalized)) {
        return null;
    }
    return path.join(root, normalized);
}

function featureText(feature) {
    var lines = ['Feature: ' + feature.name];
    (feature.tags || []).forEach(function (tag) { lines.push(tag); });
    if (feature.description) {
        lines.push('', feature.description);
    }
    (feature.scenarios || []).forEach(function (scenario) {
        lines.push('');
        (scenario.tags || []).forEach(function (tag) { lines.push('  ' + tag); });
        lines.push('  Scenario: ' + scenario.name);
        (scenario.steps || []).forEach(function (step) { lines.push('    ' + (step.keyword || 'Given ') + step.name); });
    });
    return lines.join('\n') + '\n';
}

function formatFeaturePath(value) {
    return String(value || '').replace(/\\/g, '/').split('/').slice(-3).join('/');
}

function availableTags(features) {
    return features.reduce(function (tags, feature) {
        return tags.concat(feature.tags || [], (feature.elements || []).reduce(function (scenarioTags, scenario) { return scenarioTags.concat(scenario.tags || []); }, []));
    }, []).filter(function (tag, index, allTags) { return allTags.indexOf(tag) === index; });
}

function requestedRunTag(requestedTag, features) {
    var tags = availableTags(features);
    return tags.indexOf(requestedTag) >= 0 ? requestedTag : requestedTag === '@feat' && tags.indexOf('@featTest') >= 0 ? '@featTest' : null;
}

function startRun(requestedTag, featureFile, headless, response) {
    if (activeRun.status === 'running') {
        response.writeHead(409, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'A scenario run is already active.' }));
        return;
    }

    var features = discoverFeatures();
    var selectedFeature = featureFile ? features.find(function (feature) { return feature.uri === featureFile; }) : null;
    if (featureFile && !selectedFeature) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'Selected feature file was not found.' }));
        return;
    }

    var tag = requestedRunTag(requestedTag, features);
    if (!selectedFeature && !tag) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'No scenarios currently use ' + requestedTag + '.' }));
        return;
    }

    activeRun = { status: 'running', tag: selectedFeature ? null : tag, requestedTag: requestedTag, featureFile: featureFile || null, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, message: selectedFeature ? 'Running all scenarios in ' + path.basename(featureFile) : 'Running ' + tag };
    var runnerArgs = [path.join(root, 'index.js'), '--disableLaunchReport'];
    if (headless) {
        runnerArgs.push('--headless');
    }
    if (selectedFeature) {
        runnerArgs.push('--allScenarios', '--featureFiles', path.join(root, featureFile));
    }
    else {
        runnerArgs.push('--tags', tag);
    }
    var runner = childProcess.spawn(process.execPath, runnerArgs, { cwd: root, windowsHide: true, stdio: 'ignore' });
    activeRun.pid = runner.pid;
    activeRun.headless = headless;
    runner.on('close', function (code) {
        activeRun.status = code === 0 ? 'complete' : 'failed';
        activeRun.exitCode = code;
        activeRun.finishedAt = new Date().toISOString();
        activeRun.message = code === 0 ? 'Run complete' : 'Run finished with failures';
    });
    response.writeHead(202, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(activeRun));
}

function sendFile(response, filePath, contentType) {
    fs.readFile(filePath, function (error, data) {
        if (error) {
            response.writeHead(404);
            response.end('Not found');
            return;
        }

        response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        response.end(data);
    });
}

function sendJson(response, filePath, fallback) {
    fs.readFile(filePath, function (error, data) {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        if (error) {
            response.end(JSON.stringify(fallback));
            return;
        }

        try {
            JSON.parse(data.toString());
            response.end(data);
        }
        catch (parseError) {
            response.end(JSON.stringify(fallback));
        }
    });
}

function readJson(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch (error) {
        return fallback;
    }
}

http.createServer(function (request, response) {
    var requestPath = request.url.split('?')[0];

    if (requestPath === '/api/progress') {
        sendJson(response, path.join(reports, 'progress.json'), {
            status: 'idle',
            current: null,
            scenarios: [],
            counts: { passed: 0, failed: 0, running: 0, queued: 0 }
        });
        return;
    }

    if (requestPath === '/api/report') {
        sendJson(response, path.join(reports, 'cucumber-report.json'), []);
        return;
    }

    if (requestPath === '/api/features') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(discoverFeatures()));
        return;
    }

    if (requestPath === '/api/feature' && request.method === 'GET') {
        var requestedFeature = safeFeaturePath(new URL(request.url, 'http://localhost').searchParams.get('file'));
        var loadedFeature = requestedFeature && readFeature(requestedFeature);
        response.writeHead(loadedFeature ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(loadedFeature || { message: 'Feature file not found.' }));
        return;
    }

    if (requestPath === '/api/feature' && request.method === 'POST') {
        var editBody = '';
        request.on('data', function (chunk) { editBody += chunk; });
        request.on('end', function () {
            try {
                var edit = JSON.parse(editBody || '{}');
                var existingPath = safeFeaturePath(edit.uri);
                var targetUri = edit.newUri || edit.uri;
                var targetPath = safeFeaturePath(targetUri);
                if (!targetPath || !edit.name || !Array.isArray(edit.scenarios)) throw new Error('Invalid feature data.');
                if (existingPath && existingPath !== targetPath && fs.existsSync(existingPath)) fs.renameSync(existingPath, targetPath);
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.writeFileSync(targetPath, featureText(edit), 'utf8');
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify(readFeature(targetPath)));
            }
            catch (error) {
                response.writeHead(400, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ message: error.message }));
            }
        });
        return;
    }

    if (requestPath === '/api/run-status') {
        var progress = readJson(path.join(reports, 'progress.json'), { status: 'idle', scenarios: [] });
        var currentRun = activeRun;
        if (currentRun.status === 'idle' && progress.status === 'running') {
            currentRun = { status: 'running', tag: null, requestedTag: null, startedAt: progress.startedAt, finishedAt: null, exitCode: null, message: 'Run in progress' };
        }
        var runFeatures = discoverFeatures().map(function (feature) {
            var matching = (progress.scenarios || []).filter(function (scenario) { return formatFeaturePath(scenario.featureFile) === formatFeaturePath(feature.uri); });
            var status = matching.length && matching.some(function (scenario) { return scenario.status === 'running'; }) ? 'running' : matching.length && matching.every(function (scenario) { return scenario.status === 'passed' || scenario.status === 'failed'; }) ? 'complete' : 'waiting';
            return { name: feature.name, uri: feature.uri, status: status };
        });
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ run: currentRun, features: runFeatures }));
        return;
    }

    if (requestPath === '/api/run' && request.method === 'POST') {
        var body = '';
        request.on('data', function (chunk) { body += chunk; });
        request.on('end', function () {
            var payload = body ? JSON.parse(body) : {};
            startRun(payload.tag === 'batch' ? '@batch' : '@feat', payload.featureFile || '', payload.headless !== false, response);
        });
        return;
    }

    var files = {
        '/': ['dashboard.html', 'text/html; charset=utf-8'],
        '/dashboard.html': ['dashboard.html', 'text/html; charset=utf-8'],
        '/dashboard.css': ['dashboard.css', 'text/css; charset=utf-8'],
        '/dashboard.js': ['dashboard.js', 'application/javascript; charset=utf-8']
    };

    if (files[requestPath]) {
        sendFile(response, path.join(root, files[requestPath][0]), files[requestPath][1]);
        return;
    }

    response.writeHead(404);
    response.end('Not found');
}).listen(port, function () {
    console.log('Scenario progress dashboard: http://localhost:' + port);
});
