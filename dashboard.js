/* ==========================================================================
   TestOps Console — dashboard logic
   Talks to the local dashboard-server API (/api/*).
   Self-contained: no external SDKs required.
   ========================================================================== */
'use strict';

/* ---------------- state ---------------- */
var state = { progress: null, report: [], features: [], runStatus: null, env: { headlessOnly: true } };
var activeFilter = 'all';
var studioFeature = null;
var studioOriginalUri = null;
var collapsed = {};
var POLL_MS = 1500;
var RING_R = 52;
var RING_C = 2 * Math.PI * RING_R;

/* ---------------- tiny helpers ---------------- */
function $(id) { return document.getElementById(id); }
function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function icon(name) { return '<svg class="icon"><use href="#' + name + '"/></svg>'; }

function fmtTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDuration(ms) {
    if (!ms && ms !== 0) return '—';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}
function fmtFeature(value) {
    if (!value) return '—';
    return String(value).split(/[\\/]/).pop();
}
function statusClass(s) {
    var known = ['idle', 'running', 'passed', 'failed', 'complete', 'waiting', 'queued'];
    return known.indexOf(s) >= 0 ? s : 'idle';
}
function isBusy() {
    var rs = state.runStatus && state.runStatus.run;
    return (rs && rs.status === 'running') || (state.progress && state.progress.status === 'running');
}

function emptyState(message, iconName) {
    return '<div class="empty-state">' +
        '<span class="empty-icon">' + icon(iconName || 'i-info') + '</span>' +
        '<span>' + esc(message) + '</span></div>';
}

/* ---------------- data shaping ---------------- */
function reportScenarios(report) {
    return (report || []).reduce(function (items, feature) {
        return items.concat((feature.elements || []).map(function (scenario) {
            var results = (scenario.steps || []).map(function (st) { return st.result && st.result.status; });
            return {
                name: scenario.name,
                featureFile: feature.uri,
                status: results.indexOf('failed') >= 0 ? 'failed' : 'passed',
                duration: (scenario.steps || []).reduce(function (t, st) { return t + ((st.result && st.result.duration) || 0); }, 0) / 1e6,
                steps: scenario.steps || []
            };
        }));
    }, []);
}
function liveScenarios() { return (state.progress && state.progress.scenarios) || []; }
function selectedFile() { return $('feature-select').value; }

function getScenarios() {
    var list = liveScenarios().length ? liveScenarios() : reportScenarios(state.report);
    var sel = selectedFile();
    return sel ? list.filter(function (s) { return !s.featureFile || fmtFeature(s.featureFile) === fmtFeature(sel); }) : list;
}

function mergeFeatureProgress(features, report) {
    var live = liveScenarios();
    return features.map(function (feature) {
        var done = (report || []).filter(function (e) { return fmtFeature(e.uri) === fmtFeature(feature.uri); })[0];
        return {
            name: feature.name, uri: feature.uri, description: feature.description, tags: feature.tags,
            elements: (feature.elements || []).map(function (scenario) {
                var lv = live.filter(function (e) {
                    return e.name === scenario.name && (!e.featureFile || fmtFeature(e.featureFile) === fmtFeature(feature.uri));
                })[0];
                var dn = done && (done.elements || []).filter(function (e) { return e.name === scenario.name; })[0];
                var merged = dn ? Object.assign({}, scenario, dn) : scenario;
                return lv ? Object.assign({}, merged, {
                    progressStatus: lv.status,
                    progressDuration: lv.duration,
                    steps: (lv.steps && lv.steps.length) ? lv.steps : merged.steps
                }) : merged;
            })
        };
    });
}

function reportFeatures() {
    var sel = selectedFile();
    if (state.features.length) {
        return mergeFeatureProgress(state.features.filter(function (f) { return !sel || f.uri === sel; }), state.report);
    }
    if (state.report.length) {
        return state.report.filter(function (f) { return !sel || fmtFeature(f.uri) === fmtFeature(sel); });
    }
    var scs = getScenarios();
    return [{
        name: 'Latest live run', uri: (scs[0] && scs[0].featureFile) || '',
        elements: scs.map(function (s) { return { keyword: 'Scenario', name: s.name, progressStatus: s.status, progressDuration: s.duration, steps: s.steps || [] }; })
    }];
}

function stepStatus(st) {
    return st && st.status ? st.status : st && st.result && st.result.status ? st.result.status : 'unknown';
}
function scenarioStatus(sc) {
    if (sc.progressStatus) return sc.progressStatus;
    var has = (sc.steps || []).some(function (st) { return st.status || (st.result && st.result.status); });
    if (!has) return 'waiting';
    return (sc.steps || []).some(function (st) { return stepStatus(st) === 'failed'; }) ? 'failed' : 'passed';
}
function scenarioDuration(sc) {
    if (sc.progressDuration) return sc.progressDuration;
    return (sc.steps || []).reduce(function (t, st) { return t + ((st.result && st.result.duration) || 0); }, 0) / 1e6;
}
function scenarioTags(sc) {
    return (sc.tags || []).map(function (t) { return t.name || t; }).filter(Boolean);
}
function stateGlyph(status) {
    if (status === 'passed') return icon('i-check');
    if (status === 'failed') return icon('i-x');
    return '<span class="dotmark">·</span>';
}

/* ---------------- render: overview ---------------- */
function render() {
    var progress = state.progress || { status: 'idle', counts: { passed: 0, failed: 0, running: 0, queued: 0 }, scenarios: [] };
    var scs = getScenarios();
    var counts = progress.counts || { passed: 0, failed: 0, running: 0, queued: 0 };
    var total = scs.length;
    var completed = counts.passed + counts.failed;
    var pct = total ? Math.round(completed / total * 100) : 0;
    var status = progress.status || 'idle';
    var current = progress.current || scs.filter(function (s) { return s.status === 'running'; })[0];
    var currentName = typeof current === 'string' ? current : current && current.name;
    var busy = isBusy();

    // status pill + run controls
    $('status-badge').className = 'status-pill ' + statusClass(status);
    $('status-text').textContent = String(status).toUpperCase();
    $('run-feat').classList.toggle('hidden', busy);
    $('run-batch').classList.toggle('hidden', busy);
    $('stop-run').classList.toggle('hidden', !busy);

    // global progress bar
    $('global-progress-bar').style.width = (busy ? Math.max(pct, 2) : 0) + '%';

    // run card
    $('run-title').textContent = status === 'running' ? 'Scenario run in motion' : status === 'idle' ? 'Waiting for scenarios' : 'Latest run complete';
    var runId = progress.runId ? '#' + String(progress.runId).replace(/\D/g, '').slice(0, 12) : '—';
    $('run-id').textContent = runId;
    $('run-id-meta').textContent = runId;
    $('progress-value').textContent = pct + '%';
    $('ring-fill').style.strokeDasharray = RING_C;
    $('ring-fill').style.strokeDashoffset = RING_C * (1 - pct / 100);

    var stClass = statusClass(currentName ? 'running' : (status === 'idle' ? 'idle' : status));
    $('current-status').className = 'live-tag ' + stClass;
    $('current-status-text').textContent = currentName ? 'Executing now' : (status === 'idle' ? 'Stand by' : 'Run complete');
    $('current-scenario').textContent = currentName || 'No scenario is running';
    $('current-detail').textContent = currentName
        ? 'The runner is moving through its steps. Results will land here as each scenario exits.'
        : status === 'idle'
            ? 'Start a tagged or feature-specific run and this console will follow every scenario as it moves through its steps.'
            : 'Every observed scenario has reported back. Review the stream below for the detail.';

    $('started-at').textContent = fmtTime(progress.startedAt);
    var end = (progress.updatedAt && status !== 'running') ? new Date(progress.updatedAt) : new Date();
    $('elapsed').textContent = progress.startedAt ? fmtDuration(end.getTime() - new Date(progress.startedAt).getTime()) : '—';

    // stats
    $('passed').textContent = counts.passed;
    $('failed').textContent = counts.failed;
    $('running').textContent = counts.running;
    $('total').textContent = total;

    // health
    var health = completed ? Math.round(counts.passed / completed * 100) : 0;
    $('health-score').textContent = completed ? health + '%' : '—';
    $('health-copy').textContent = completed
        ? (counts.failed ? counts.failed + ' scenario' + (counts.failed === 1 ? '' : 's') + ' need attention.' : 'All completed scenarios passed cleanly.')
        : 'No completed scenarios yet.';
    $('health-bar').style.width = health + '%';
    $('health-pass').textContent = counts.passed;
    $('health-fail').textContent = counts.failed;
    $('health-queued').textContent = counts.queued;

    renderStream(scs);
    renderQueue();
    renderReports();
    renderSelects();
    renderModeHint();
}

function renderModeHint() {
    var active = document.querySelector('#browser-mode .seg-btn.active');
    var windowed = active && active.dataset.mode === 'windowed';
    $('mode-hint').classList.toggle('hidden', !(windowed && state.env.headlessOnly));
}

/* ---------------- render: stream ---------------- */
function renderStream(scs) {
    var visible = scs.slice().reverse().filter(function (s) {
        return activeFilter === 'all' || s.status === activeFilter;
    });
    $('stream').innerHTML = visible.length ? visible.map(streamRow).join('') : emptyState('No scenarios match this filter.', 'i-chart');
}
function streamRow(s) {
    var st = statusClass(s.status || 'queued');
    return '<div class="stream-row">' +
        '<span class="status-chip ' + st + '">' + stateGlyph(st) + '</span>' +
        '<div class="stream-main"><div class="stream-name">' + esc(s.name) + '</div>' +
        '<div class="stream-meta">' + esc(fmtFeature(s.featureFile)) + '</div></div>' +
        '<span class="stream-state ' + st + '">' + st + '</span>' +
        '<span class="stream-time">' + (s.duration ? fmtDuration(s.duration) : st === 'running' ? 'live' : '—') + '</span></div>';
}

/* ---------------- render: queue ---------------- */
function renderQueue() {
    var rs = state.runStatus || { run: { status: 'idle', message: 'Ready to run' }, features: state.features };
    $('run-message').textContent = rs.run.message || 'Ready to run';

    var sel = selectedFile();
    var list = (rs.features || []).filter(function (f) { return !sel || f.uri === sel; });
    $('feature-status-list').innerHTML = list.length
        ? list.map(function (f) {
            var st = statusClass(f.status);
            return '<div class="queue-row">' +
                '<span class="status-dot ' + st + '"></span>' +
                '<div class="queue-name"><strong>' + esc(fmtFeature(f.uri)) + '</strong><small>' + esc(f.name) + '</small></div>' +
                '<span class="queue-status ' + st + '">' + st + '</span></div>';
        }).join('')
        : emptyState('No feature files detected.');
}

/* ---------------- render: reports ---------------- */
function renderReports() {
    var features = reportFeatures();
    var scs = features.reduce(function (a, f) { return a.concat(f.elements || []); }, []);
    var passed = scs.filter(function (s) { return scenarioStatus(s) === 'passed'; }).length;
    var failed = scs.filter(function (s) { return scenarioStatus(s) === 'failed'; }).length;
    var running = scs.filter(function (s) { return scenarioStatus(s) === 'running'; }).length;
    var waiting = scs.filter(function (s) { return scenarioStatus(s) === 'waiting'; }).length;
    var completed = passed + failed;
    var passRate = completed ? Math.round(passed / completed * 100) : 0;
    var duration = scs.reduce(function (t, s) { return t + scenarioDuration(s); }, 0);

    $('report-total').textContent = scs.length;
    $('report-pass-rate').textContent = completed ? passRate + '%' : '—';
    $('report-pass-copy').textContent = completed ? passed + ' of ' + completed + ' completed passed' : 'No completed scenarios';
    $('report-features').textContent = features.length;
    $('report-duration').textContent = fmtDuration(duration);

    var rs = state.runStatus || { run: { status: 'idle', startedAt: null } };
    $('report-run-status').textContent = String(rs.run.status || 'idle').toUpperCase();
    $('report-run-time').textContent = fmtTime(rs.run.startedAt);

    drawDonut([
        { value: passed, color: 'var(--pass)', label: 'Passed' },
        { value: failed, color: 'var(--fail)', label: 'Failed' },
        { value: running, color: 'var(--run)', label: 'Running' },
        { value: waiting, color: 'var(--queued)', label: 'Waiting' }
    ], passRate);

    $('feature-report').innerHTML = features.length
        ? features.map(featureBlock).join('')
        : emptyState('No report data is available yet — run a scenario to populate this view.', 'i-chart');
}

function drawDonut(segments, passRate) {
    var total = segments.reduce(function (t, s) { return t + s.value; }, 0);
    var offset = 0;
    var rings = total
        ? segments.filter(function (s) { return s.value > 0; }).map(function (s) {
            var frac = s.value / total;
            var dash = frac * RING_C;
            var seg = '<circle class="donut-seg" cx="60" cy="60" r="' + RING_R + '" stroke="' + s.color +
                '" stroke-dasharray="' + dash + ' ' + (RING_C - dash) + '" stroke-dashoffset="' + (-offset) + '"></circle>';
            offset += dash;
            return seg;
        }).join('')
        : '<circle class="donut-seg" cx="60" cy="60" r="' + RING_R + '" stroke="#eef0f4" stroke-dasharray="' + RING_C + ' ' + RING_C + '"></circle>';
    $('donut').innerHTML = rings;

    $('donut-center').innerHTML = '<strong>' + (total ? passRate + '%' : '—') + '</strong><small>pass rate</small>';
    $('dist-legend').innerHTML = segments.map(function (s) {
        return '<div class="legend-row"><span class="swatch" style="background:' + s.color + '"></span><span>' + s.label + '</span><b>' + s.value + '</b></div>';
    }).join('');
}

function featureBlock(feature) {
    var scs = feature.elements || [];
    var fp = scs.filter(function (s) { return scenarioStatus(s) === 'passed'; }).length;
    var ff = scs.filter(function (s) { return scenarioStatus(s) === 'failed'; }).length;
    var fr = scs.filter(function (s) { return scenarioStatus(s) === 'running'; }).length;
    var key = feature.uri;
    var isCollapsed = !!collapsed['f:' + key];
    var counts = '';
    if (fp) counts += '<span class="count-chip pass">' + fp + ' pass</span>';
    if (fr) counts += '<span class="count-chip run">' + fr + ' live</span>';
    if (ff) counts += '<span class="count-chip fail">' + ff + ' fail</span>';

    return '<article class="feature-block' + (isCollapsed ? ' collapsed' : '') + '">' +
        '<button class="feature-head" data-feature-key="' + esc(key) + '">' +
        '<svg class="icon feature-chevron"><use href="#i-chevron"/></svg>' +
        '<span class="feature-copy"><span class="feature-path">' + esc(fmtFeature(feature.uri)) + '</span>' +
        '<strong>' + esc(feature.name || 'Unnamed feature') + '</strong>' +
        '<small>' + esc(feature.description || 'Feature execution details') + '</small></span>' +
        '<span class="feature-counts">' + counts + '</span></button>' +
        '<div class="feature-body">' + scs.map(function (s, i) { return scenarioBlock(s, key + ':' + i); }).join('') + '</div></article>';
}

function scenarioBlock(scenario, key) {
    var st = scenarioStatus(scenario);
    var isCollapsed = !!collapsed['s:' + key];
    var steps = (scenario.steps || []).map(stepRow).join('');
    var error = (scenario.steps || []).filter(function (s) { return s.result && s.result.error_message; }).map(function (s) {
        return '<div class="step-error">' + esc(s.result.error_message) + '</div>';
    }).join('');

    return '<section class="scenario-block ' + st + (isCollapsed ? ' collapsed' : '') + '">' +
        '<button class="scenario-head" data-scenario-key="' + esc(key) + '">' +
        '<svg class="icon scenario-chevron"><use href="#i-chevron"/></svg>' +
        '<span class="scenario-state ' + st + '">' + stateGlyph(st) + '</span>' +
        '<span class="scenario-copy"><span class="scenario-tags">' + esc(scenarioTags(scenario).join(' ')) + '</span>' +
        '<strong>' + esc(scenario.name || 'Unnamed scenario') + '</strong></span>' +
        '<span class="scenario-duration">' + (scenarioDuration(scenario) ? fmtDuration(scenarioDuration(scenario)) : st === 'running' ? 'live' : '—') + '</span>' +
        '</button>' +
        '<div class="scenario-steps">' + (steps || '<div class="step-row"><span class="step-name">No steps recorded.</span></div>') + '</div>' +
        error + '</section>';
}

function stepRow(step) {
    var st = stepStatus(step);
    var dur = (step.result && step.result.duration) ? fmtDuration(step.result.duration / 1e6) : '—';
    var glyph = st === 'passed' ? icon('i-check') : st === 'failed' ? icon('i-x') : '<span class="dotmark">·</span>';
    return '<div class="step-row">' +
        '<span class="step-icon ' + st + '">' + glyph + '</span>' +
        '<span class="step-name"><span class="kw">' + esc(step.keyword || '') + '</span>' + esc(step.name || '') + '</span>' +
        '<span class="step-duration">' + dur + '</span></div>';
}

/* ---------------- render: selects & file list ---------------- */
function renderSelects() {
    var sel = $('feature-select');
    var current = sel.value;
    var opts = '<option value="">All feature files</option>' + state.features.map(function (f) {
        return '<option value="' + esc(f.uri) + '">' + esc(fmtFeature(f.uri)) + '</option>';
    }).join('');
    if (sel.innerHTML !== opts) {
        sel.innerHTML = opts;
        if (Array.prototype.some.call(sel.options, function (o) { return o.value === current; })) sel.value = current;
    }

    var list = $('studio-file-list');
    var activeUri = studioFeature && studioFeature.uri;
    var markup = state.features.map(function (f) {
        return '<button class="file-item' + (f.uri === activeUri ? ' active' : '') + '" data-uri="' + esc(f.uri) + '">' +
            '<span class="file-icon">' + icon('i-file') + '</span>' +
            '<span class="file-copy"><strong>' + esc(fmtFeature(f.uri)) + '</strong><small>' + esc(f.name || '') + '</small></span></button>';
    }).join('');
    if (list.innerHTML !== markup) list.innerHTML = markup;

    $('last-updated').textContent = 'Updated ' + fmtTime(new Date());
}

/* ---------------- studio ---------------- */
function loadStudioFeature(uri) {
    if (!uri) return;
    $('studio-message').textContent = 'Loading…';
    $('studio-message').className = 'studio-message';
    fetch('/api/feature?file=' + encodeURIComponent(uri))
        .then(function (r) { return r.json(); })
        .then(function (f) {
            if (f && f.message) throw new Error(f.message);
            studioFeature = f;
            studioOriginalUri = f.uri;
            renderStudio();
        })
        .catch(function (e) { $('studio-message').textContent = e.message; });
}

function renderStudio() {
    if (!studioFeature) return;
    $('studio-uri').value = studioFeature.uri || '';
    $('studio-name').value = studioFeature.name || '';
    $('studio-tags').value = (studioFeature.tags || []).join(' ');
    $('studio-description').value = studioFeature.description || '';
    $('studio-scenarios').innerHTML = (studioFeature.elements || []).map(scenarioEditor).join('');
    $('studio-message').textContent = '';
    $('studio-message').className = 'studio-message';
}

var KEYWORDS = ['Given ', 'When ', 'Then ', 'And ', 'But '];

function scenarioEditor(scenario, index) {
    var steps = (scenario.steps || []).map(function (step, stepIndex) {
        var kw = String(step.keyword || 'Given ').trim();
        var options = KEYWORDS.map(function (k) {
            return '<option' + (kw === k.trim() ? ' selected' : '') + '>' + k + '</option>';
        }).join('');
        return '<div class="step-row-editor" data-step="' + stepIndex + '">' +
            '<select class="step-keyword">' + options + '</select>' +
            '<input class="step-name" value="' + esc(step.name || '') + '" placeholder="Step text">' +
            '<button class="icon-btn" data-action="remove-step" title="Remove step">' + icon('i-x') + '</button></div>';
    }).join('');

    return '<div class="scenario-editor" data-scenario="' + index + '">' +
        '<div class="scenario-editor-head">' +
        '<input class="scenario-name" value="' + esc(scenario.name || '') + '" placeholder="Scenario name">' +
        '<input class="scenario-tags" value="' + esc((scenario.tags || []).join(' ')) + '" placeholder="@tag1 @tag2">' +
        '<button class="btn ghost danger" data-action="remove-scenario">Remove</button></div>' +
        '<div class="steps">' + steps + '</div>' +
        '<button class="btn ghost" data-action="add-step">' + icon('i-plus') + ' Add step</button></div>';
}

function readStudioForm() {
    var scenarios = Array.prototype.map.call(document.querySelectorAll('.scenario-editor'), function (card) {
        return {
            name: card.querySelector('.scenario-name').value.trim(),
            tags: card.querySelector('.scenario-tags').value.split(/\s+/).filter(Boolean),
            steps: Array.prototype.map.call(card.querySelectorAll('.step-row-editor'), function (row) {
                return { keyword: row.querySelector('.step-keyword').value, name: row.querySelector('.step-name').value.trim() };
            })
        };
    });
    var uri = $('studio-uri').value.trim();
    return {
        uri: uri,
        newUri: (studioOriginalUri && studioOriginalUri !== uri) ? uri : undefined,
        name: $('studio-name').value.trim(),
        tags: $('studio-tags').value.split(/\s+/).filter(Boolean),
        description: $('studio-description').value.trim(),
        scenarios: scenarios
    };
}

function saveStudioFeature() {
    var feature = readStudioForm();
    if (!feature.uri || !feature.name) {
        $('studio-message').textContent = 'File path and feature name are required.';
        $('studio-message').className = 'studio-message error';
        return;
    }
    $('studio-message').textContent = 'Saving…';
    $('studio-message').className = 'studio-message';
    fetch('/api/feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feature)
    })
        .then(function (r) {
            return r.json().then(function (p) { if (!r.ok) throw new Error(p.message || 'Save failed'); return p; });
        })
        .then(function (saved) {
            studioFeature = saved;
            studioOriginalUri = saved.uri;
            renderStudio();
            toast('Feature saved · ' + fmtFeature(saved.uri), 'success');
            load();
        })
        .catch(function (e) {
            $('studio-message').textContent = e.message;
            $('studio-message').className = 'studio-message error';
            toast(e.message, 'error');
        });
}

/* ---------------- actions ---------------- */
function currentMode() {
    var active = document.querySelector('#browser-mode .seg-btn.active');
    return active ? (active.dataset.mode || 'headless') : 'headless';
}

function startRun(kind) {
    var file = $('feature-select').value;
    var mode = currentMode();
    var label = file ? fmtFeature(file) : kind === 'batch' ? 'batch' : '@feat';
    $('run-message').textContent = 'Starting ' + label + '…';
    // re-check the environment at click time — never trust a stale headlessOnly flag
    fetch('/api/env?ts=' + Date.now())
        .then(function (r) { return r.json(); })
        .catch(function () { return null; })
        .then(function (env) {
            if (env) state.env = env;
            var headlessOnly = !!state.env.headlessOnly;
            var headless = mode === 'headless' || headlessOnly;
            if (mode === 'windowed' && headlessOnly) {
                toast('Headed mode needs a desktop — this server has no display, so it will run headless.', 'error');
            }
            return fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag: kind, featureFile: file, headless: headless })
            });
        })
        .then(function (r) {
            return r.json().then(function (p) { if (!r.ok) throw new Error(p.message || 'Could not start run'); return p; });
        })
        .then(function (run) {
            $('run-message').textContent = run.message || ('Running ' + label);
            toast('Run started · ' + label + (run.headless === false ? ' (windowed)' : ''), 'success');
            load();
        })
        .catch(function (e) {
            $('run-message').textContent = e.message;
            toast(e.message, 'error');
        });
}

function stopRun() {
    $('stop-run').disabled = true;
    fetch('/api/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function (r) {
            return r.json().then(function (p) { if (!r.ok) throw new Error(p.message || 'Could not stop run'); return p; });
        })
        .then(function (p) { toast(p.message || 'Run stopped.', 'success'); load(); })
        .catch(function (e) { toast(e.message, 'error'); })
        .then(function () { $('stop-run').disabled = false; });
}

function toast(message, kind) {
    var host = $('toast-host');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
        el.classList.remove('show');
        setTimeout(function () { el.remove(); }, 300);
    }, 3200);
}

function switchView(view) {
    ['overview', 'reports', 'studio'].forEach(function (v) {
        $('view-' + v).classList.toggle('hidden', v !== view);
    });
    document.querySelectorAll('.tab').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    if (view === 'studio' && !studioFeature && state.features.length) loadStudioFeature(state.features[0].uri);
}

/* ---------------- data loading ---------------- */
function load() {
    Promise.all([
        fetch('/api/progress?ts=' + Date.now()).then(function (r) { return r.json(); }),
        fetch('/api/report?ts=' + Date.now()).then(function (r) { return r.json(); }),
        fetch('/api/features?ts=' + Date.now()).then(function (r) { return r.json(); }),
        fetch('/api/run-status?ts=' + Date.now()).then(function (r) { return r.json(); }),
        fetch('/api/env?ts=' + Date.now()).then(function (r) { return r.json(); })
    ])
        .then(function (data) {
            state.progress = data[0];
            state.report = data[1];
            state.features = data[2];
            state.runStatus = data[3];
            state.env = data[4] || state.env;
            render();
        })
        .catch(function () { render(); });
}

/* ---------------- event wiring ---------------- */
document.addEventListener('click', function (event) {
    var tab = event.target.closest('.tab');
    if (tab) { switchView(tab.dataset.view); return; }

    var filter = event.target.closest('.filter');
    if (filter) {
        document.querySelectorAll('.filter').forEach(function (f) { f.classList.remove('active'); });
        filter.classList.add('active');
        activeFilter = filter.dataset.filter;
        render();
        return;
    }

    var seg = event.target.closest('.seg-btn');
    if (seg) {
        document.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('active'); });
        seg.classList.add('active');
        renderModeHint();
        return;
    }

    var featureHead = event.target.closest('.feature-head');
    if (featureHead) {
        var fk = featureHead.dataset.featureKey;
        collapsed['f:' + fk] = !collapsed['f:' + fk];
        featureHead.parentElement.classList.toggle('collapsed', collapsed['f:' + fk]);
        return;
    }

    var scenarioHead = event.target.closest('.scenario-head');
    if (scenarioHead) {
        var sk = scenarioHead.dataset.scenarioKey;
        collapsed['s:' + sk] = !collapsed['s:' + sk];
        scenarioHead.parentElement.classList.toggle('collapsed', collapsed['s:' + sk]);
        return;
    }

    var fileItem = event.target.closest('.file-item');
    if (fileItem) { loadStudioFeature(fileItem.dataset.uri); return; }

    var action = event.target.closest('[data-action]');
    if (action && action.closest('#studio-scenarios')) {
        var scenario = action.closest('.scenario-editor');
        if (!scenario) return;
        var feature = readStudioForm();
        var si = Number(scenario.dataset.scenario);

        if (action.dataset.action === 'remove-scenario') {
            feature.scenarios.splice(si, 1);
        } else if (action.dataset.action === 'add-step') {
            feature.scenarios[si].steps.push({ keyword: 'Given ', name: 'a new step' });
        } else if (action.dataset.action === 'remove-step') {
            var row = action.closest('.step-row-editor');
            feature.scenarios[si].steps.splice(Number(row.dataset.step), 1);
        }
        studioFeature = {
            uri: feature.uri, name: feature.name, description: feature.description,
            tags: feature.tags, elements: feature.scenarios
        };
        renderStudio();
    }
});

$('refresh').addEventListener('click', load);
$('run-feat').addEventListener('click', function () { startRun('feat'); });
$('run-batch').addEventListener('click', function () { startRun('batch'); });
$('stop-run').addEventListener('click', stopRun);
$('feature-select').addEventListener('change', render);

$('save-feature').addEventListener('click', saveStudioFeature);
$('add-scenario').addEventListener('click', function () {
    var feature = readStudioForm();
    feature.scenarios.push({ name: 'New scenario', tags: [], steps: [{ keyword: 'Given ', name: 'a starting condition' }] });
    studioFeature = { uri: feature.uri, name: feature.name, description: feature.description, tags: feature.tags, elements: feature.scenarios };
    renderStudio();
});
$('new-feature').addEventListener('click', function () {
    studioFeature = {
        uri: 'features/new-feature.feature', name: 'New feature', description: '', tags: [],
        elements: [{ keyword: 'Scenario', name: 'New scenario', tags: [], steps: [{ keyword: 'Given ', name: 'a starting condition' }] }]
    };
    studioOriginalUri = null;
    renderStudio();
});

/* ---------------- boot ---------------- */
load();
setInterval(load, POLL_MS);
