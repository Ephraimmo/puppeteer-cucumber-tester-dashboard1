var https = require('https');

var databaseUrl = 'https://e-comm-bd997-default-rtdb.firebaseio.com';

function firebaseRunId(runId) {
    return String(runId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function publish(path, value) {
    var payload = JSON.stringify(value);
    var request = https.request(databaseUrl + '/' + path + '.json', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 3000
    }, function (response) {
        response.resume();
    });

    request.on('error', function () {
        // Firebase is an observability mirror; local progress must keep running if it is unavailable.
    });
    request.on('timeout', function () {
        request.destroy();
    });
    request.write(payload);
    request.end();
}

module.exports = {
    publish: function (state) {
        var runId = firebaseRunId(state.runId);
        publish('scenarioRuns/latest', state);
        publish('scenarioRuns/runs/' + runId, state);
    }
};
