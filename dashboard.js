var state = { progress: null, report: [], features: [], runStatus: null };
var activeFilter = 'all';
var activeView = 'overview';
var firebaseLive = false;
var collapsedFeatures = {};
var collapsedScenarios = {};
var studioFeature = null;
var firebaseConfig = {
    apiKey: 'AIzaSyBCTflur84nQjEc-YdsD_p2sR8eI7BD6nA',
    authDomain: 'e-comm-bd997.firebaseapp.com',
    databaseURL: 'https://e-comm-bd997-default-rtdb.firebaseio.com',
    projectId: 'e-comm-bd997',
    storageBucket: 'e-comm-bd997.appspot.com',
    messagingSenderId: '280613901400',
    appId: '1:280613901400:web:bf168e55508b9102dda62d'
};

function byId(id) { return document.getElementById(id); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]; }); }
function formatTime(value) { return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'; }
function formatDuration(milliseconds) { if (!milliseconds) return '--'; var seconds = Math.round(milliseconds / 1000); return seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's'; }
function formatFeature(value) { return value ? String(value).split(/[\\/]/).pop() : 'feature file pending'; }
function reportScenarios(report) { return report.reduce(function (items, feature) { return items.concat((feature.elements || []).map(function (scenario) { var results = (scenario.steps || []).map(function (step) { return step.result && step.result.status; }); var failed = results.indexOf('failed') >= 0; return { name: scenario.name, featureFile: feature.uri, status: failed ? 'failed' : 'passed', duration: (scenario.steps || []).reduce(function (total, step) { return total + ((step.result && step.result.duration) || 0); }, 0) / 1000000 }; })); }, []); }
function selectedFeatureFile() { var selector = byId('feature-select'); return selector ? selector.value : ''; }
function getScenarios() {
    var scenarios = state.progress && state.progress.scenarios.length ? state.progress.scenarios : reportScenarios(state.report);
    var selected = selectedFeatureFile();
    return selected ? scenarios.filter(function (scenario) { return !scenario.featureFile || formatFeature(scenario.featureFile) === formatFeature(selected); }) : scenarios;
}
function reportFeatures() {
    var selected = selectedFeatureFile();
    if (state.features.length) {
        return mergeFeatureProgress(state.features.filter(function (feature) { return !selected || feature.uri === selected; }), state.report);
    }
    if (state.report.length) return state.report.filter(function (feature) { return !selected || formatFeature(feature.uri) === formatFeature(selected); });
    var scenarios = getScenarios();
    return [{ name: 'Latest live run', uri: scenarios[0] && scenarios[0].featureFile || '', elements: scenarios.map(function (scenario) { return { keyword: 'Scenario', name: scenario.name, progressStatus: scenario.status, progressDuration: scenario.duration, steps: scenario.steps || [] }; }) }];
}
function mergeFeatureProgress(features, report) {
    var liveScenarios = state.progress && state.progress.scenarios ? state.progress.scenarios : [];
    return features.map(function (feature) {
        var completedFeature = (report || []).find(function (entry) { return formatFeature(entry.uri) === formatFeature(feature.uri); });
        return Object.assign({}, feature, { elements: (feature.elements || []).map(function (scenario) {
            var live = liveScenarios.find(function (entry) { return entry.name === scenario.name && (!entry.featureFile || formatFeature(entry.featureFile) === formatFeature(feature.uri)); });
            var completed = completedFeature && (completedFeature.elements || []).find(function (entry) { return entry.name === scenario.name; });
            var merged = completed ? Object.assign({}, scenario, completed) : scenario;
            return live ? Object.assign({}, merged, { progressStatus: live.status, progressDuration: live.duration, steps: live.steps && live.steps.length ? live.steps : merged.steps }) : merged;
        }) });
    });
}
function reportStepStatus(step) { return step && step.status ? step.status : step && step.result && step.result.status ? step.result.status : 'unknown'; }
function reportScenarioStatus(scenario) {
    if (scenario.progressStatus) return scenario.progressStatus;
    var hasResults = (scenario.steps || []).some(function (step) { return step.status || step.result && step.result.status; });
    if (!hasResults) return 'waiting';
    return (scenario.steps || []).some(function (step) { return reportStepStatus(step) === 'failed'; }) ? 'failed' : 'passed';
}
function reportDuration(scenario) {
    if (scenario.progressDuration) return scenario.progressDuration;
    return (scenario.steps || []).reduce(function (total, step) { return total + ((step.result && step.result.duration) || 0); }, 0) / 1000000;
}
function reportTags(scenario) {
    return (scenario.tags || []).map(function (tag) { return tag.name || tag; }).filter(Boolean);
}
function render() {
    var progress = state.progress || { status: 'idle', counts: { passed: 0, failed: 0, running: 0, queued: 0 }, scenarios: [] };
    var scenarios = getScenarios();
    var counts = progress.counts || { passed: 0, failed: 0, running: 0, queued: 0 };
    var total = scenarios.length;
    var completed = counts.passed + counts.failed;
    var percent = total ? Math.round(completed / total * 100) : 0;
    var status = progress.status || 'idle';
    var current = progress.current || scenarios.find(function (scenario) { return scenario.status === 'running'; });
    var currentName = typeof current === 'string' ? current : current && current.name;

    byId('status-badge').innerHTML = '<i></i> ' + escapeHtml(status.toUpperCase());
    byId('run-title').textContent = status === 'running' ? 'Scenario run in motion' : status === 'idle' ? 'Waiting for scenarios' : 'Latest run complete';
    byId('run-id').textContent = progress.runId ? '#' + progress.runId.slice(11, 19).replace(/T/g, '') : '--';
    byId('progress-value').textContent = percent + '%';
    byId('progress-ring').style.background = 'conic-gradient(var(--mint) ' + percent * 3.6 + 'deg, #38534d 0deg)';
    byId('current-status').textContent = currentName ? 'Executing now' : status === 'passed' ? 'Run complete' : 'Stand by';
    byId('current-scenario').textContent = currentName || 'No scenario is running';
    byId('current-detail').textContent = currentName ? 'The runner is moving through its steps. Results will land here as each scenario exits.' : status === 'idle' ? 'Start a tagged or feature-specific run and this room will follow each scenario as it moves.' : 'Every observed scenario has reported back. Review the stream below for the detail.';
    byId('started-at').textContent = formatTime(progress.startedAt);
    byId('elapsed').textContent = progress.startedAt ? formatDuration((progress.updatedAt ? new Date(progress.updatedAt) : new Date()).getTime() - new Date(progress.startedAt).getTime()) : '--';
    byId('passed').textContent = counts.passed;
    byId('failed').textContent = counts.failed;
    byId('running').textContent = counts.running;
    byId('total').textContent = total;
    byId('last-updated').textContent = progress.updatedAt ? 'Updated ' + formatTime(progress.updatedAt) : 'Waiting for a run';
    var health = completed ? Math.round(counts.passed / completed * 100) : 0;
    byId('health-score').textContent = completed ? health + '%' : '--';
    byId('health-copy').textContent = completed ? counts.failed ? counts.failed + ' scenario' + (counts.failed === 1 ? '' : 's') + ' need attention.' : 'Everything completed cleanly.' : 'No completed scenarios yet.';
    byId('health-bar').style.width = health + '%';
    renderStream(scenarios);
    renderReports();
    renderRunQueue();
}
function renderRunQueue() {
    var runStatus = state.runStatus || { run: { status: 'idle', message: 'Ready to run' }, features: state.features };
    byId('run-message').textContent = runStatus.run.message || 'Ready to run';
    byId('run-feat').disabled = runStatus.run.status === 'running';
    byId('run-batch').disabled = runStatus.run.status === 'running';
    var featureSelect = byId('feature-select');
    var selectedFeature = featureSelect.value;
    featureSelect.innerHTML = '<option value="">All feature files</option>' + (state.features || []).map(function (feature) { return '<option value="' + escapeHtml(feature.uri) + '">' + escapeHtml(formatFeature(feature.uri)) + '</option>'; }).join('');
    featureSelect.value = selectedFeature;
    var studioSelect = byId('studio-file-select');
    if (studioSelect) {
        var studioValue = studioSelect.value;
        studioSelect.innerHTML = (state.features || []).map(function (feature) { return '<option value="' + escapeHtml(feature.uri) + '">' + escapeHtml(formatFeature(feature.uri)) + '</option>'; }).join('');
        studioSelect.value = studioValue && (state.features || []).some(function (feature) { return feature.uri === studioValue; }) ? studioValue : state.features[0] && state.features[0].uri || '';
        if (!studioFeature && studioSelect.value) loadStudioFeature(studioSelect.value);
    }
    var selected = selectedFeatureFile();
    var visibleFeatures = (runStatus.features || []).filter(function (feature) { return !selected || feature.uri === selected; });
    byId('feature-status-list').innerHTML = visibleFeatures.map(function (feature) {
        return '<div class="feature-status-row"><span class="feature-status-dot ' + escapeHtml(feature.status) + '"></span><span class="feature-status-name">' + escapeHtml(formatFeature(feature.uri)) + '<small>' + escapeHtml(feature.name) + '</small></span><span class="feature-status-label ' + escapeHtml(feature.status) + '">' + escapeHtml(feature.status) + '</span></div>';
    }).join('') || '<span class="empty-state">No feature files detected.</span>';
}
function loadStudioFeature(uri) {
    if (!uri) return;
    fetch('/api/feature?file=' + encodeURIComponent(uri)).then(function (response) { return response.json(); }).then(function (feature) {
        studioFeature = feature;
        renderStudio();
    }).catch(function (error) { byId('studio-message').textContent = error.message; });
}
function studioTags(value) { return (value || '').split(/\s+/).filter(Boolean); }
function renderStudio() {
    if (!studioFeature) return;
    byId('studio-uri').value = studioFeature.uri || '';
    byId('studio-name').value = studioFeature.name || '';
    byId('studio-tags').value = (studioFeature.tags || []).join(' ');
    byId('studio-description').value = studioFeature.description || '';
    byId('studio-scenarios').innerHTML = (studioFeature.elements || []).map(function (scenario, scenarioIndex) {
        return '<article class="studio-scenario" data-scenario-index="' + scenarioIndex + '"><div class="studio-scenario-head"><input class="scenario-edit-name" value="' + escapeHtml(scenario.name) + '"><input class="scenario-edit-tags" value="' + escapeHtml((scenario.tags || []).join(' ')) + '" placeholder="@tag"><button class="remove-scenario" title="Remove scenario">Remove</button></div><div class="studio-steps">' + (scenario.steps || []).map(function (step, stepIndex) { return '<div class="studio-step" data-step-index="' + stepIndex + '"><input class="step-keyword" value="' + escapeHtml(step.keyword || 'Given ') + '"><input class="step-name" value="' + escapeHtml(step.name || '') + '"><button class="remove-step" title="Remove step">×</button></div>'; }).join('') + '</div><button class="add-step">+ Add step</button></article>';
    }).join('');
}
function readStudioForm() {
    var feature = { uri: byId('studio-uri').value.trim(), name: byId('studio-name').value.trim(), tags: studioTags(byId('studio-tags').value), description: byId('studio-description').value.trim(), scenarios: [] };
    document.querySelectorAll('.studio-scenario').forEach(function (card) {
        var scenario = { name: card.querySelector('.scenario-edit-name').value.trim(), tags: studioTags(card.querySelector('.scenario-edit-tags').value), steps: [] };
        card.querySelectorAll('.studio-step').forEach(function (step) { scenario.steps.push({ keyword: step.querySelector('.step-keyword').value, name: step.querySelector('.step-name').value.trim() }); });
        feature.scenarios.push(scenario);
    });
    return feature;
}
function saveStudioFeature() {
    var feature = readStudioForm();
    fetch('/api/feature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(feature) }).then(function (response) { return response.json().then(function (payload) { if (!response.ok) throw new Error(payload.message); return payload; }); }).then(function (saved) { studioFeature = saved; byId('studio-message').textContent = 'Saved ' + formatFeature(saved.uri) + ' at ' + new Date().toLocaleTimeString(); load(); }).catch(function (error) { byId('studio-message').textContent = error.message; });
}
function renderReports() {
    var features = reportFeatures();
    var scenarios = features.reduce(function (items, feature) { return items.concat(feature.elements || []); }, []);
    var passed = scenarios.filter(function (scenario) { return reportScenarioStatus(scenario) === 'passed'; }).length;
    var failed = scenarios.filter(function (scenario) { return reportScenarioStatus(scenario) === 'failed'; }).length;
    var running = scenarios.filter(function (scenario) { return reportScenarioStatus(scenario) === 'running'; }).length;
    var totalDuration = scenarios.reduce(function (total, scenario) { return total + reportDuration(scenario); }, 0);
    var total = scenarios.length;
    var completedTotal = passed + failed;
    var rate = completedTotal ? Math.round(passed / completedTotal * 100) : 0;
    byId('report-total').textContent = total;
    byId('report-pass-rate').textContent = rate + '%';
    byId('report-pass-copy').textContent = running ? running + ' scenario' + (running === 1 ? '' : 's') + ' still running' : failed ? failed + ' scenario' + (failed === 1 ? '' : 's') + ' need attention' : 'Everything completed cleanly';
    byId('report-features').textContent = features.length;
    byId('report-duration').textContent = totalDuration ? formatDuration(totalDuration) : '--';
    byId('report-passed-count').textContent = passed;
    byId('report-failed-count').textContent = failed;
    byId('report-caption').textContent = total ? passed + ' of ' + completedTotal + ' completed scenarios passed' : 'No report loaded';
    byId('report-run-status').textContent = state.progress && state.progress.status ? state.progress.status.toUpperCase() : 'LATEST RUN';
    byId('report-run-time').textContent = state.progress && state.progress.updatedAt ? formatTime(state.progress.updatedAt) : '--';
    byId('distribution-pass').style.width = (completedTotal ? passed / completedTotal * 100 : 0) + '%';
    byId('distribution-fail').style.width = (completedTotal ? failed / completedTotal * 100 : 0) + '%';
    byId('feature-report').innerHTML = features.map(function (feature, featureIndex) {
        var featureScenarios = feature.elements || [];
        var featurePassed = featureScenarios.filter(function (scenario) { return reportScenarioStatus(scenario) === 'passed'; }).length;
        var featureFailed = featureScenarios.filter(function (scenario) { return reportScenarioStatus(scenario) === 'failed'; }).length;
        var featureRunning = featureScenarios.filter(function (scenario) { return reportScenarioStatus(scenario) === 'running'; }).length;
        var featureKey = feature.uri || feature.name || String(featureIndex);
        var queueFeature = state.runStatus && (state.runStatus.features || []).find(function (entry) { return entry.uri === feature.uri; });
        var featureStatus = queueFeature ? queueFeature.status : 'waiting';
        return '<article class="feature-block' + (collapsedFeatures[featureKey] ? ' collapsed' : '') + '"><button class="feature-heading" data-feature-key="' + escapeHtml(featureKey) + '"><span class="feature-chevron">&#9662;</span><span class="feature-heading-copy"><span class="feature-kicker">FEATURE FILE</span><strong>' + escapeHtml(feature.name || 'Unnamed feature') + '</strong><small>' + escapeHtml(formatFeature(feature.uri)) + '</small></span><span class="feature-run-state ' + escapeHtml(featureStatus) + '">' + escapeHtml(featureStatus) + '</span><span class="feature-counts"><b class="count-pass">' + featurePassed + '</b><b class="count-running">' + featureRunning + '</b><b class="count-fail">' + featureFailed + '</b></span></button><div class="feature-description">' + escapeHtml(feature.description || 'Feature execution details') + '</div><div class="feature-scenarios">' + featureScenarios.map(function (scenario, scenarioIndex) { return reportScenarioMarkup(scenario, featureKey + ':' + scenarioIndex); }).join('') + '</div></article>';
    }).join('');
    document.querySelectorAll('.feature-heading').forEach(function (button) { button.addEventListener('click', function () { var key = button.dataset.featureKey; collapsedFeatures[key] = !collapsedFeatures[key]; button.parentElement.classList.toggle('collapsed', collapsedFeatures[key]); }); });
    document.querySelectorAll('.scenario-heading').forEach(function (button) { button.addEventListener('click', function () { var key = button.dataset.scenarioKey; collapsedScenarios[key] = !collapsedScenarios[key]; button.parentElement.classList.toggle('collapsed', collapsedScenarios[key]); }); });
}
function reportScenarioMarkup(scenario, scenarioKey) {
    var status = reportScenarioStatus(scenario);
    var steps = scenario.steps || [];
    var tags = reportTags(scenario);
    var stepMarkup = steps.length ? '<div class="report-steps">' + steps.map(function (step) { var stepStatus = reportStepStatus(step); var stepDuration = step.result && step.result.duration ? formatDuration(step.result.duration / 1000000) : step.duration ? formatDuration(step.duration) : '--'; return '<div class="report-step"><span class="step-icon ' + escapeHtml(stepStatus) + '">' + (stepStatus === 'passed' ? '&#10003;' : stepStatus === 'failed' ? '!' : '&#8226;') + '</span><span class="step-name">' + escapeHtml((step.keyword || '') + (step.name || '')) + '</span><span class="step-duration">' + stepDuration + '</span></div>'; }).join('') + '</div>' : '<div class="report-steps"><div class="report-step"><span class="step-icon ' + escapeHtml(status) + '">' + (status === 'passed' ? '&#10003;' : status === 'running' ? '&#8226;' : '!') + '</span><span class="step-name">Live scenario ledger</span><span class="step-duration">' + (reportDuration(scenario) ? formatDuration(reportDuration(scenario)) : '--') + '</span></div></div>';
    return '<section class="report-scenario ' + escapeHtml(status) + (collapsedScenarios[scenarioKey] ? ' collapsed' : '') + '"><button class="scenario-heading" data-scenario-key="' + escapeHtml(scenarioKey) + '"><span class="scenario-chevron">&#9662;</span><span class="scenario-state">' + (status === 'passed' ? '&#10003;' : status === 'running' ? '&#8226;' : '!') + '</span><span class="scenario-copy"><span class="scenario-tags">' + escapeHtml(tags.join(' ')) + '</span><span class="scenario-type">Scenario:</span><strong>' + escapeHtml(scenario.name || 'Unnamed scenario') + '</strong></span><span class="scenario-duration">' + (reportDuration(scenario) ? formatDuration(reportDuration(scenario)) : status === 'running' ? 'live' : '--') + '</span></button>' + stepMarkup + '</section>';
}
function renderStream(scenarios) {
    var visible = scenarios.slice().reverse().filter(function (scenario) { return activeFilter === 'all' || scenario.status === activeFilter; });
    byId('stream').innerHTML = visible.length ? visible.map(function (scenario) {
        var symbol = scenario.status === 'passed' ? '&#10003;' : scenario.status === 'failed' ? '!' : scenario.status === 'running' ? '&#8226;' : '&#183;';
        return '<div class="stream-row"><span class="stream-icon ' + escapeHtml(scenario.status) + '">' + symbol + '</span><div><div class="stream-name">' + escapeHtml(scenario.name) + '</div><div class="stream-meta">' + escapeHtml(formatFeature(scenario.featureFile)) + ' / ' + escapeHtml(scenario.status.toUpperCase()) + (scenario.finishedAt ? ' / ' + formatTime(scenario.finishedAt) : '') + '</div></div><span class="stream-time">' + (scenario.duration ? formatDuration(scenario.duration) : scenario.status === 'running' ? 'live' : '--') + '</span></div>';
    }).join('') : '<div class="empty-state">No scenarios match this view.</div>';
}
function load() {
    Promise.all([fetch('/api/progress?ts=' + Date.now()).then(function (response) { return response.json(); }), fetch('/api/report?ts=' + Date.now()).then(function (response) { return response.json(); }), fetch('/api/features?ts=' + Date.now()).then(function (response) { return response.json(); }), fetch('/api/run-status?ts=' + Date.now()).then(function (response) { return response.json(); })]).then(function (data) { if (!firebaseLive) state.progress = data[0]; state.report = data[1]; state.features = data[2]; state.runStatus = data[3]; render(); }).catch(function () { render(); });
}
function startRun(kind) {
    var featureFile = byId('feature-select').value;
    byId('run-message').textContent = 'Starting ' + (featureFile ? formatFeature(featureFile) : kind === 'batch' ? 'batch' : '@feat') + '...';
    fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: kind, featureFile: featureFile, headless: byId('browser-mode').value === 'headless' }) }).then(function (response) { return response.json().then(function (payload) { if (!response.ok) throw new Error(payload.message); return payload; }); }).then(function () { load(); }).catch(function (error) { byId('run-message').textContent = error.message; });
}
function connectFirebase() {
    if (!window.firebase || !window.firebase.database) {
        byId('connection-status').textContent = 'Local fallback';
        return;
    }

    try {
        if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
        window.firebase.database().ref('scenarioRuns/latest').on('value', function (snapshot) {
            if (!snapshot.exists()) return;
            firebaseLive = true;
            state.progress = snapshot.val();
            byId('connection-status').textContent = 'Firebase realtime';
            render();
        }, function () {
            byId('connection-status').textContent = 'Local fallback';
        });
    }
    catch (error) {
        byId('connection-status').textContent = 'Local fallback';
    }
}
document.querySelectorAll('.filter').forEach(function (button) { button.addEventListener('click', function () { document.querySelectorAll('.filter').forEach(function (item) { item.classList.remove('active'); }); button.classList.add('active'); activeFilter = button.dataset.filter; render(); }); });
byId('refresh').addEventListener('click', load);
document.querySelectorAll('[data-run]').forEach(function (button) { button.addEventListener('click', function () { startRun(button.dataset.run); }); });
byId('feature-select').addEventListener('change', function () { render(); });
document.querySelectorAll('.nav-item').forEach(function (button) { button.addEventListener('click', function () { activeView = button.dataset.view; document.querySelectorAll('.nav-item').forEach(function (item) { item.classList.toggle('active', item === button); }); byId('overview-view').classList.toggle('hidden', activeView !== 'overview' && activeView !== 'stream'); byId('reports-view').classList.toggle('hidden', activeView !== 'reports'); byId('studio-view').classList.toggle('hidden', activeView !== 'studio'); byId('page-title').textContent = activeView === 'reports' ? 'Reports' : activeView === 'studio' ? 'Feature studio' : activeView === 'stream' ? 'Scenario stream' : 'Run overview'; if (activeView === 'stream') byId('stream').scrollIntoView({ behavior: 'smooth', block: 'start' }); if (activeView === 'studio' && !studioFeature && byId('studio-file-select').value) loadStudioFeature(byId('studio-file-select').value); }); });
byId('studio-file-select').addEventListener('change', function () { loadStudioFeature(this.value); });
byId('save-feature').addEventListener('click', saveStudioFeature);
byId('new-feature').addEventListener('click', function () { studioFeature = { uri: 'features/new-feature.feature', name: 'New feature', description: '', tags: [], elements: [{ keyword: 'Scenario', name: 'New scenario', tags: [], steps: [{ keyword: 'Given ', name: 'a starting condition' }] }] }; renderStudio(); });
byId('add-scenario').addEventListener('click', function () { var feature = readStudioForm(); feature.scenarios.push({ keyword: 'Scenario', name: 'New scenario', tags: [], steps: [{ keyword: 'Given ', name: 'a starting condition' }] }); studioFeature = { uri: feature.uri, name: feature.name, description: feature.description, tags: feature.tags, elements: feature.scenarios }; renderStudio(); });
byId('studio-scenarios').addEventListener('click', function (event) { var scenario = event.target.closest('.studio-scenario'); if (!scenario) return; if (event.target.classList.contains('add-step')) { var feature = readStudioForm(); feature.scenarios[Number(scenario.dataset.scenarioIndex)].steps.push({ keyword: 'Given ', name: 'a new step' }); studioFeature = { uri: feature.uri, name: feature.name, description: feature.description, tags: feature.tags, elements: feature.scenarios }; renderStudio(); } if (event.target.classList.contains('remove-step')) { var feature = readStudioForm(); feature.scenarios[Number(scenario.dataset.scenarioIndex)].steps.splice(Number(event.target.closest('.studio-step').dataset.stepIndex), 1); studioFeature = { uri: feature.uri, name: feature.name, description: feature.description, tags: feature.tags, elements: feature.scenarios }; renderStudio(); } if (event.target.classList.contains('remove-scenario')) { var feature = readStudioForm(); feature.scenarios.splice(Number(scenario.dataset.scenarioIndex), 1); studioFeature = { uri: feature.uri, name: feature.name, description: feature.description, tags: feature.tags, elements: feature.scenarios }; renderStudio(); } });
load();
connectFirebase();
setInterval(load, 1000);
