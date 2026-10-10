var fs = require('fs-plus');
var path = require('path');
var firebaseProgress = require('./firebase-progress.js');

var progressPath = path.resolve(global.reportsPath || path.join(process.cwd(), 'features', 'reports'), 'progress.json');
var state = {
    runId: null,
    status: 'idle',
    startedAt: null,
    updatedAt: null,
    current: null,
    scenarios: [],
    counts: { passed: 0, failed: 0, running: 0, queued: 0 }
};

var listeners = [];

function writeState() {
    // tell listeners (the live view) first: they only need the in-memory state, and a
    // failing disk write below must not keep them from seeing the current step
    listeners.forEach(function (listener) {
        try { listener(state); }
        catch (error) { /* a listener must never break progress tracking */ }
    });

    var tempPath = progressPath + '.tmp';
    var serializedState = JSON.stringify(state, null, 2);

    fs.writeFileSync(tempPath, serializedState);
    try {
        fs.renameSync(tempPath, progressPath);
    }
    catch (error) {
        if (error.code !== 'EPERM' && error.code !== 'EACCES') {
            throw error;
        }

        fs.writeFileSync(progressPath, serializedState);
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }

    firebaseProgress.publish(state);
}

// cucumber 1.3 registerHandler('AfterScenario') passes a ScenarioResult wrapper — unwrap it
function unwrapScenario(scenario) {
    return scenario && typeof scenario.getScenario === 'function' ? scenario.getScenario() : scenario;
}

function scenarioName(scenario) {
    var inner = unwrapScenario(scenario);

    if (!inner && !scenario) {
        return 'Unknown scenario';
    }

    if (typeof (inner || scenario).getName === 'function') {
        return (inner || scenario).getName();
    }

    return (scenario || {}).name || (inner || {}).name || 'Unknown scenario';
}

function scenarioFile(scenario) {
    var inner = unwrapScenario(scenario);
    var target = inner || scenario;

    if (!target) {
        return null;
    }

    if (typeof target.getUri === 'function') {
        var uri = target.getUri();
        if (uri) {
            return uri;
        }
    }

    if (typeof target.getFeature === 'function' && target.getFeature() && typeof target.getFeature().getUri === 'function') {
        var featureUri = target.getFeature().getUri();
        if (featureUri) {
            return featureUri;
        }
    }

    return target.uri || target.featureFile || null;
}

function stepName(step) {
    if (!step) {
        return 'Unknown step';
    }

    return typeof step.getName === 'function' ? step.getName() : step.name || 'Unknown step';
}

function stepKeyword(step) {
    if (!step || typeof step.getKeyword !== 'function') {
        return '';
    }

    try {
        return step.getKeyword();
    }
    catch (e) {
        return '';
    }
}

function refreshCounts() {
    state.counts = state.scenarios.reduce(function (counts, scenario) {
        if (scenario.status === 'passed') {
            counts.passed += 1;
        }
        else if (scenario.status === 'failed') {
            counts.failed += 1;
        }
        else if (scenario.status === 'running') {
            counts.running += 1;
        }
        else {
            counts.queued += 1;
        }

        return counts;
    }, { passed: 0, failed: 0, running: 0, queued: 0 });
}

module.exports = {
    /**
     * Calls listener(state) every time the progress changes (before it is written to disk).
     * @param {function} listener - receives the live progress state; must not modify it
     * @returns {void}
     */
    onChange: function (listener) {
        listeners.push(listener);
    },

    start: function () {
        state = {
            runId: new Date().toISOString(),
            status: 'running',
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            current: null,
            scenarios: [],
            counts: { passed: 0, failed: 0, running: 0, queued: 0 }
        };
        writeState();
    },

    beforeScenario: function (scenario) {
        var name = scenarioName(scenario);
        var item = state.scenarios.find(function (entry) { return entry.name === name && entry.status === 'queued'; });

        if (!item) {
            item = { name: name, featureFile: scenarioFile(scenario), status: 'queued', startedAt: null, finishedAt: null, duration: 0, steps: [] };
            state.scenarios.push(item);
        }

        item.status = 'running';
        item.startedAt = new Date().toISOString();
        item.steps = [];
        state.current = name;
        state.updatedAt = new Date().toISOString();
        refreshCounts();
        writeState();
    },

    beforeStep: function (step) {
        var scenario = step && typeof step.getScenario === 'function' ? step.getScenario() : null;
        var name = scenarioName(scenario);
        var item = state.scenarios.find(function (entry) { return entry.name === name && entry.status === 'running'; });

        if (!item) {
            return;
        }

        item.steps.push({ keyword: stepKeyword(step), name: stepName(step), status: 'running', startedAt: new Date().toISOString(), duration: 0 });
        state.currentStep = stepName(step);
        state.updatedAt = new Date().toISOString();
        writeState();
    },

    afterStep: function (step) {
        var scenario = step && typeof step.getScenario === 'function' ? step.getScenario() : null;
        var name = scenarioName(scenario);
        var item = state.scenarios.find(function (entry) { return entry.name === name && entry.status === 'running'; });
        var currentStep = item && item.steps.slice().reverse().find(function (entry) { return entry.status === 'running'; });

        if (!currentStep) {
            return;
        }

        currentStep.status = 'passed';
        currentStep.finishedAt = new Date().toISOString();
        currentStep.duration = currentStep.startedAt ? new Date(currentStep.finishedAt).getTime() - new Date(currentStep.startedAt).getTime() : 0;
        state.currentStep = null;
        state.updatedAt = new Date().toISOString();
        writeState();
    },

    afterScenario: function (scenario) {
        var name = scenarioName(scenario);
        // ScenarioResult has no usable name — fall back to the scenario we marked running earlier
        if (name === 'Unknown scenario' && state.current) {
            name = state.current;
        }
        var item = state.scenarios.find(function (entry) { return entry.name === name && entry.status === 'running'; });
        var failed = false;
        if (typeof scenario.isFailed === 'function') {
            failed = scenario.isFailed();
        }
        else if (typeof scenario.getStatus === 'function') {
            failed = scenario.getStatus() === 'failed';
        }

        if (!item) {
            item = { name: name, featureFile: scenarioFile(scenario), startedAt: null, duration: 0, steps: [] };
            state.scenarios.push(item);
        }

        item.steps.forEach(function (step) {
            if (step.status === 'running') {
                step.status = failed ? 'failed' : 'passed';
                step.finishedAt = new Date().toISOString();
                step.duration = step.startedAt ? new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime() : 0;
            }
        });

        item.status = failed ? 'failed' : 'passed';
        item.finishedAt = new Date().toISOString();
        item.duration = item.startedAt ? new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime() : 0;
        state.current = null;
        state.currentStep = null;
        state.updatedAt = new Date().toISOString();
        refreshCounts();
        writeState();
    },

    finish: function (succeeded) {
        var finalFailed = false;
        state.scenarios.forEach(function (scenario) {
            if (scenario.status === 'running' || scenario.status === 'queued') {
                var scenarioHasFail = (scenario.steps || []).some(function (st) {
                    return st.status === 'failed';
                });
                scenario.steps.forEach(function (step) {
                    if (step.status === 'running') {
                        step.status = scenarioHasFail ? 'failed' : (succeeded ? 'passed' : 'failed');
                        step.finishedAt = step.finishedAt || new Date().toISOString();
                        step.duration = step.startedAt ? new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime() : 0;
                    }
                });
                scenario.status = scenarioHasFail ? 'failed' : (scenario.status === 'queued' ? 'queued' : (succeeded ? 'passed' : 'failed'));
                scenario.finishedAt = scenario.finishedAt || new Date().toISOString();
                scenario.duration = scenario.startedAt ? new Date(scenario.finishedAt).getTime() - new Date(scenario.startedAt).getTime() : 0;
                if (scenario.status === 'failed') finalFailed = true;
            } else if (scenario.status === 'failed') {
                finalFailed = true;
            }
        });
        state.status = succeeded && !finalFailed ? 'passed' : 'failed';
        state.current = null;
        state.currentStep = null;
        state.updatedAt = new Date().toISOString();
        refreshCounts();
        writeState();
    }
};
