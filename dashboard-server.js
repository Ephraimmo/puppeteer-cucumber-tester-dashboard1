var http = require('http');
var fs = require('fs');
var path = require('path');
var gherkin = require('gherkin');
var childProcess = require('child_process');
var puppeteer;
try { puppeteer = require('puppeteer'); }
catch (error) { puppeteer = null; }

var root = __dirname;
var reports = path.join(root, 'features', 'reports');
var port = process.env.PORT || 4173;
var activeRun = { status: 'idle', tag: null, requestedTag: null, startedAt: null, finishedAt: null, exitCode: null, message: 'Ready to run' };
var stopRequested = false;
var runnerProcess = null;
var recordSessions = {};
var liveFrame = null; // latest test-browser frame from runtime/live-view.js, served by /api/live

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
        var children = feature.children || [];
        var background = null;
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.type === 'Background' && child.background) {
                background = {
                    keyword: child.background.keyword || 'Background',
                    name: child.background.name || '',
                    steps: (child.background.steps || []).map(function (step) { return { keyword: step.keyword || '', name: step.text || step.name || '' }; })
                };
                break;
            }
            if (child.type === 'Background') {
                background = {
                    keyword: child.keyword || 'Background',
                    name: child.name || '',
                    steps: (child.steps || []).map(function (step) { return { keyword: step.keyword || '', name: step.text || step.name || '' }; })
                };
                break;
            }
        }
        function cellValue(c) { return (c && (c.value !== undefined)) ? c.value : (c || ''); }

        var scenarios = children.filter(function (child) {
            var type = child.type;
            if (type === 'Scenario' || type === 'ScenarioOutline') return true;
            if (type === 'Background') return false;
            if (child.scenario && (child.scenario.type === 'Scenario' || child.scenario.type === 'ScenarioOutline')) return true;
            return false;
        }).map(function (scenario) {
            var base = scenario.scenario || scenario;
            var isOutline = (base.type === 'ScenarioOutline') || Array.isArray(base.examples) && base.examples.length > 0;
            var result = {
                keyword: base.keyword || (isOutline ? 'Scenario Outline' : 'Scenario'),
                name: base.name,
                tags: (base.tags || []).map(function (tag) { return tag.name; }),
                steps: (base.steps || []).map(function (step) { return { keyword: step.keyword || '', name: step.text || step.name || '' }; })
            };
            if (isOutline && Array.isArray(base.examples) && base.examples.length > 0) {
                result.isOutline = true;
                result.examples = base.examples.map(function (ex) {
                    return {
                        keyword: ex.keyword || 'Examples',
                        name: ex.name || '',
                        tags: (ex.tags || []).map(function (tag) { return tag.name; }),
                        header: (ex.tableHeader && ex.tableHeader.cells) ? ex.tableHeader.cells.map(cellValue) : [],
                        body: Array.isArray(ex.tableBody) ? ex.tableBody.map(function (row) {
                            return (row.cells || []).map(cellValue);
                        }) : []
                    };
                });
            } else {
                result.isOutline = false;
                result.examples = [];
            }
            return result;
        });
        return {
            name: feature.name,
            description: feature.description || '',
            uri: path.relative(root, filePath).replace(/\\/g, '/'),
            tags: (feature.tags || []).map(function (tag) { return tag.name; }),
            background: background,
            elements: scenarios
        };
    }
    catch (error) {
        return null;
    }
}

function discoverFeatures() {
    return featureFiles(path.join(root, 'features')).map(readFeature).filter(Boolean);
}

// Turns a step-definition regex body (e.g. `^I enter "([^"]*)" into "([^"]*)"$`)
// into a readable template (`I enter "..." into "..."`) for editor suggestions.
function humanizeStepPattern(body) {
    var text = String(body || '');
    text = text.replace(/^\^/, '').replace(/\$$/, '');
    text = text.replace(/\(\?:([^()]*)\)/g, function (match, alt) { return alt.split('|')[0]; });
    text = text.replace(/\([^()]*\)/g, '...');
    text = text.replace(/\\([.\\+*?^$()[\]{}|\/])/g, '$1');
    return text.trim();
}

var STEP_DEFINITIONS_DIR = path.join(root, 'features', 'step-definitions');

// Strips the common leading indentation from a step body extracted out of a file, and
// drops the blank line that normally follows the opening `{` / precedes the closing `}` —
// so what's shown/edited in the UI is clean, and doesn't accumulate extra indentation on
// every subsequent save.
function dedentStepBody(bodyText) {
    var lines = String(bodyText || '').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    var minIndent = Infinity;
    lines.forEach(function (line) {
        if (!line.trim()) return;
        minIndent = Math.min(minIndent, /^[ \t]*/.exec(line)[0].length);
    });
    if (!isFinite(minIndent)) minIndent = 0;
    return lines.map(function (line) { return line.slice(minIndent); }).join('\n');
}

// Scans this.Given/When/Then(/regex/flags, async function (params) { ...body... }); calls
// out of one file's content, walking brace depth (skipping braces inside string/template
// literals) to find each function body's real end rather than assuming a single-line body —
// this is what makes editing an existing step's body possible. blockStart/blockEnd mark the
// exact span (starting at "this." itself) that a rewrite should replace.
function extractStepBlocksFromContent(content) {
    var results = [];
    var callPattern = /this\.(Given|When|Then)\(\s*\/((?:\\.|[^\\\/])*)\/([a-z]*)\s*,\s*(?:async\s+)?function\s*\(([^)]*)\)\s*\{/g;
    var match;
    while ((match = callPattern.exec(content))) {
        var blockStart = match.index;
        var bodyStart = callPattern.lastIndex;
        var depth = 1;
        var i = bodyStart;
        var inString = null;
        while (i < content.length && depth > 0) {
            var ch = content[i];
            if (inString) {
                if (ch === '\\') { i += 2; continue; }
                if (ch === inString) inString = null;
                i++; continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') { inString = ch; i++; continue; }
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        var bodyEnd = i - 1;
        var tailMatch = /^\s*\)\s*;/.exec(content.slice(bodyEnd + 1));
        var blockEnd = tailMatch ? bodyEnd + 1 + tailMatch[0].length : bodyEnd + 1;
        results.push({
            keyword: match[1], source: match[2], flags: match[3] || '', params: (match[4] || '').trim(),
            body: dedentStepBody(content.slice(bodyStart, bodyEnd)),
            blockStart: blockStart, blockEnd: blockEnd
        });
        callPattern.lastIndex = blockEnd;
    }
    return results;
}

function scanStepDefinitionFiles() {
    var files;
    try { files = fs.readdirSync(STEP_DEFINITIONS_DIR).filter(function (f) { return f.toLowerCase().endsWith('.js'); }); }
    catch (error) { return []; }
    return files;
}

// Every step definition across every file, with its full body — used by the Step
// Definitions explorer/editor. Re-scanned fresh every call (files are small) so edits made
// outside the dashboard are picked up immediately, with no server restart.
function scanStepDefinitionBlocks() {
    var results = [];
    scanStepDefinitionFiles().forEach(function (file) {
        var content;
        try { content = fs.readFileSync(path.join(STEP_DEFINITIONS_DIR, file), 'utf8'); }
        catch (error) { return; }
        extractStepBlocksFromContent(content).forEach(function (block) {
            results.push({
                file: file, keyword: block.keyword, source: block.source, flags: block.flags,
                pattern: humanizeStepPattern(block.source), params: block.params, body: block.body
            });
        });
    });
    return results;
}

// Reads every this.Given/When/Then(/regex/flags, ...) call out of the project's
// step-definition files. Shared by the autocomplete suggestion list (humanized)
// and the recorder's "does a step already exist for this?" check (compiled regex).
function scanStepDefinitionSources() {
    return scanStepDefinitionBlocks().map(function (block) {
        return { keyword: block.keyword, source: block.source, flags: block.flags, file: block.file };
    });
}

// Validates a step-definition file name typed in the UI: no path segments (it always
// lives directly in features/step-definitions/), letters/numbers/spaces/-/_ only, .js.
function safeStepDefName(name) {
    var normalized = String(name || '').trim();
    if (!normalized) return null;
    if (!/\.js$/i.test(normalized)) normalized += '.js';
    if (normalized.indexOf('..') >= 0 || /[\\/]/.test(normalized) || path.isAbsolute(normalized)) return null;
    if (!/^[A-Za-z0-9 _.-]+\.js$/i.test(normalized)) return null;
    return normalized;
}

// Turns a step template using literal "..." placeholders (e.g. `I enter "..." into the
// "..." field`) into an anchored step-definition regex source, escaping everything else.
function compileStepPattern(template) {
    var placeholder = '"..."';
    var segments = String(template || '').trim().split(placeholder);
    var escaped = segments.map(function (segment) { return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    return { source: '^' + escaped.join('"([^"]*)"') + '$', paramCount: segments.length - 1 };
}

function discoverStepDefinitions() {
    return scanStepDefinitionSources().map(function (def) {
        return { keyword: def.keyword, text: humanizeStepPattern(def.source) };
    }).filter(function (def) { return def.text; });
}

// Compiled patterns used to check whether a recorded interaction already has a
// runnable step definition. Re-scanned fresh every call (files are small and this
// mirrors discoverFeatures()'s no-cache approach) so a newly-written step is picked
// up immediately, with no server restart.
function discoverStepPatterns() {
    return scanStepDefinitionSources().reduce(function (patterns, def) {
        try { patterns.push(new RegExp(def.source, def.flags)); }
        catch (error) { /* malformed pattern in a step-definitions file — skip it */ }
        return patterns;
    }, []);
}

function isStepDefined(text) {
    var patterns = discoverStepPatterns();
    return patterns.some(function (pattern) { return pattern.test(text); });
}

// Suggestion pool for the step autocomplete: known step-definition patterns
// (as reusable templates) plus concrete step text already used in feature files.
function stepSuggestions() {
    var seen = {};
    var suggestions = [];
    function add(keyword, text) {
        var clean = String(text || '').trim();
        if (!clean) return;
        var key = clean.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        suggestions.push({ keyword: keyword || 'Given', text: clean });
    }
    discoverStepDefinitions().forEach(function (s) { add(s.keyword, s.text); });
    discoverFeatures().forEach(function (feature) {
        var steps = ((feature.background && feature.background.steps) || []).concat(
            (feature.elements || []).reduce(function (acc, scenario) { return acc.concat(scenario.steps || []); }, [])
        );
        steps.forEach(function (step) { add(String(step.keyword || '').trim(), step.name); });
    });
    return suggestions;
}

function safeFeaturePath(uri) {
    var normalized = String(uri || '').replace(/\\/g, '/');
    if (!normalized.toLowerCase().endsWith('.feature') || normalized.indexOf('..') >= 0 || path.isAbsolute(normalized)) {
        return null;
    }
    return path.join(root, normalized);
}

function normalizeTag(value) {
    var s = String(value || '').trim();
    if (!s) return null;
    if (s.charAt(0) !== '@') s = '@' + s;
    if (!/^@[A-Za-z0-9_\-]+$/.test(s)) return null;
    return s;
}
function normalizeTags(list) {
    return (list || []).map(normalizeTag).filter(Boolean);
}

function padCells(row, widths) {
    return '| ' + row.map(function (cell, i) {
        var w = widths[i] || 0;
        var v = String(cell == null ? '' : cell);
        return v + ' '.repeat(Math.max(0, w - v.length));
    }).join(' | ') + ' |';
}

function computeWidths(rows) {
    var widths = [];
    rows.forEach(function (row) {
        (row || []).forEach(function (cell, i) {
            var len = String(cell == null ? '' : cell).length;
            if (!widths[i] || widths[i] < len) widths[i] = len;
        });
    });
    return widths;
}

function featureText(feature) {
    var lines = [];
    var featureTags = normalizeTags(feature.tags || []);
    if (featureTags.length) {
        lines.push(featureTags.join(' '));
    }
    lines.push('Feature: ' + feature.name);
    if (feature.description) {
        lines.push('', feature.description);
    }
    if (feature.background && Array.isArray(feature.background.steps) && (feature.background.name || feature.background.steps.length)) {
        lines.push('');
        lines.push('  Background: ' + String(feature.background.name || '').trim());
        (feature.background.steps || []).forEach(function (step) {
            var kw = String(step.keyword || 'Given ').trim();
            if (['Given', 'When', 'Then', 'And', 'But', '*'].indexOf(kw) < 0) kw = 'Given';
            lines.push('    ' + kw + ' ' + String(step.name || '').trim());
        });
    }
    (feature.scenarios || []).forEach(function (scenario) {
        lines.push('');
        var scenarioTags = normalizeTags(scenario.tags || []);
        if (scenarioTags.length) {
            lines.push('  ' + scenarioTags.join(' '));
        }
        var isOutline = scenario.isOutline === true || (Array.isArray(scenario.examples) && scenario.examples.length > 0);
        var keyword = (scenario.keyword || '').trim();
        if (!keyword) keyword = isOutline ? 'Scenario Outline' : 'Scenario';
        lines.push('  ' + keyword + ': ' + scenario.name);
        (scenario.steps || []).forEach(function (step) {
            var kw = String(step.keyword || 'Given ').trim();
            if (['Given', 'When', 'Then', 'And', 'But', '*'].indexOf(kw) < 0) kw = 'Given';
            lines.push('    ' + kw + ' ' + String(step.name || '').trim());
        });
        if (isOutline && Array.isArray(scenario.examples)) {
            scenario.examples.forEach(function (ex) {
                if (!ex) return;
                var header = ex.header || [];
                var body = ex.body || [];
                if (!header.length && !body.length) return;
                lines.push('');
                var exTags = normalizeTags(ex.tags || []);
                if (exTags.length) {
                    lines.push('    ' + exTags.join(' '));
                }
                var exKeyword = (ex.keyword || 'Examples').trim();
                var exName = String(ex.name || '').trim();
                lines.push('    ' + exKeyword + (exName ? ': ' + exName : ':'));
                var allRows = [header].concat(body || []);
                var widths = computeWidths(allRows);
                lines.push('      ' + padCells(header, widths));
                (body || []).forEach(function (row) {
                    lines.push('      ' + padCells(row, widths));
                });
            });
        }
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
    if (!requestedTag) return null;
    var normalized = normalizeTag(requestedTag);
    if (!normalized) return null;
    if (tags.indexOf(normalized) >= 0) return normalized;
    if (normalized === '@feat' && tags.indexOf('@featTest') >= 0) return '@featTest';
    return null;
}

function hasDisplay() {
    if (process.platform === 'win32' || process.platform === 'darwin') return true;
    return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

// Finds a real Chrome binary to launch a HEADED (visible) browser for recording —
// puppeteer's bundled Chromium is often not installed in this repo (postinstall
// downloads Firefox instead, see package.json), so fall back to a system Chrome.
function resolveChromeExecutable() {
    var bundledPath = puppeteer && puppeteer.executablePath();
    if (bundledPath && fs.existsSync(bundledPath)) return bundledPath;
    var candidates = [
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    return candidates.find(function (candidate) { return candidate && fs.existsSync(candidate); }) || null;
}

// Injected into the recorded page (and re-injected on every navigation via
// evaluateOnNewDocument) — watches clicks, field edits, and text selections and
// reports them back to Node through the exposed __recordStep binding. Written so
// the phrasing it produces matches step definitions already in
// features/step-definitions where possible, so a recorded scenario can run
// without new glue code.
function recorderPageInit() {
    if (window.__recorderAttached) return;
    window.__recorderAttached = true;

    function labelFor(el) {
        if (!el) return '';
        var aria = el.getAttribute && el.getAttribute('aria-label');
        if (aria && aria.trim()) return aria.trim();
        if (el.id) {
            try {
                var byFor = document.querySelector('label[for="' + window.CSS.escape(el.id) + '"]');
                if (byFor && byFor.textContent && byFor.textContent.trim()) return byFor.textContent.trim().replace(/\s+/g, ' ');
            }
            catch (error) { /* CSS.escape unsupported / bad id — fall through */ }
        }
        var wrappingLabel = el.closest && el.closest('label');
        if (wrappingLabel && wrappingLabel.textContent && wrappingLabel.textContent.trim()) {
            return wrappingLabel.textContent.trim().replace(/\s+/g, ' ');
        }
        if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();
        if (el.name && el.name.trim()) return el.name.trim();
        if (el.title && el.title.trim()) return el.title.trim();
        if ((el.type === 'submit' || el.type === 'button') && el.value) return el.value.trim();
        var innerText = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (innerText) return innerText.slice(0, 60);
        return (el.tagName || 'element').toLowerCase();
    }

    document.addEventListener('click', function (event) {
        var target = event.target && event.target.closest
            ? event.target.closest('button, a, input[type="submit"], input[type="button"], [role="button"], [role="link"]')
            : null;
        if (!target) return;
        var label = labelFor(target);
        if (!label || !window.__recordStep) return;
        window.__recordStep({ kind: 'click', label: label });
    }, true);

    document.addEventListener('change', function (event) {
        var el = event.target;
        if (!el || !el.tagName || !window.__recordStep) return;
        var tag = el.tagName;
        var label = labelFor(el);

        if (tag === 'SELECT') {
            var optionText = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : el.value;
            window.__recordStep({ kind: 'select', label: label, value: optionText });
            return;
        }
        if (tag === 'INPUT' && el.type === 'checkbox') {
            window.__recordStep({ kind: el.checked ? 'check' : 'uncheck', label: label });
            return;
        }
        if (tag === 'INPUT' && el.type === 'radio') {
            window.__recordStep({ kind: 'radio', label: label });
            return;
        }
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
        if (['submit', 'button'].indexOf(el.type) >= 0) return;
        window.__recordStep({ kind: 'input', label: label, value: el.value });
    }, true);

    // Highlighting text on the page is treated as "assert this is visible" —
    // fires once the mouse is released so a drag-select becomes a single step.
    var lastSelection = '';
    document.addEventListener('mouseup', function () {
        setTimeout(function () {
            var text = String((window.getSelection && window.getSelection().toString()) || '').trim();
            if (!text) { lastSelection = ''; return; }
            if (text !== lastSelection && text.length <= 200 && window.__recordStep) {
                lastSelection = text;
                window.__recordStep({ kind: 'assert', value: text });
            }
        }, 0);
    }, true);
}

/* ---------------- recorded-interaction -> Gherkin step templates ----------------
   Each kind maps a raw interaction to: the canonical step text to try to match
   against existing step definitions, and — if nothing matches — a ready-to-run
   step definition a user can request via "Request a Step". */
var STEP_TEMPLATES = {
    navigate: {
        keyword: 'Given',
        text: function (m) { return 'I am online at "' + m.value + '"'; },
        description: function (m) { return 'Opens "' + m.value + '" in the browser to start the scenario.'; },
        code: function () {
            return 'this.Given(/^I am online at "([^"]*)"$/, async function (url) {\n' +
                '    await page.goto(url, { waitUntil: \'domcontentloaded\' });\n' +
                '});';
        }
    },
    landed: {
        keyword: 'Then',
        text: function (m) { return 'I am on the website with url "' + m.value + '"'; },
        description: function (m) { return 'Checks the browser navigated to "' + m.value + '".'; },
        code: function () {
            return 'this.Then(/^I am on the website with url "([^"]*)"$/, async function (url) {\n' +
                '    await page.waitForFunction(function (expectedUrl) { return window.location.href === expectedUrl; }, { timeout: DEFAULT_TIMEOUT }, url);\n' +
                '});';
        }
    },
    click: {
        keyword: 'When',
        text: function (m) { return 'I click on the "' + m.label + '" button'; },
        description: function (m) { return 'Finds a clickable button, link, or similar control labelled "' + m.label + '" and clicks it.'; },
        code: function () {
            return 'this.When(/^I click on the "([^"]*)" button$/, async function (label) {\n' +
                '    var clicked = await page.evaluate(function (text) {\n' +
                '        var elements = Array.prototype.slice.call(document.querySelectorAll(\'button, a, input[type="button"], input[type="submit"], [role="button"]\'));\n' +
                '        var target = elements.find(function (el) {\n' +
                '            var candidate = el.textContent || el.value || el.getAttribute(\'aria-label\') || \'\';\n' +
                '            return candidate.trim().toLowerCase() === text.trim().toLowerCase();\n' +
                '        });\n' +
                '        if (target) { target.click(); return true; }\n' +
                '        return false;\n' +
                '    }, label);\n' +
                '    if (!clicked) throw new Error(\'Could not find a clickable element labelled "\' + label + \'"\');\n' +
                '});';
        }
    },
    input: {
        keyword: 'When',
        text: function (m) { return 'I enter "' + m.value + '" into the "' + m.label + '" field'; },
        description: function (m) { return 'Finds the "' + m.label + '" field and types the recorded value into it.'; },
        code: function () {
            return 'this.When(/^I enter "([^"]*)" into the "([^"]*)" field$/, async function (value, fieldLabel) {\n' +
                '    var selector = await page.evaluate(function (label) {\n' +
                '        var normalizedLabel = label.trim().toLowerCase();\n' +
                '        var field = Array.prototype.slice.call(document.querySelectorAll(\'input, textarea\')).find(function (el) {\n' +
                '            var labels = Array.prototype.slice.call(document.querySelectorAll(\'label[for="\' + el.id + \'"]\'));\n' +
                '            var text = labels.map(function (l) { return l.textContent; }).join(\' \');\n' +
                '            return [el.name, el.id, el.placeholder, el.getAttribute(\'aria-label\'), text].some(function (attr) {\n' +
                '                return attr && attr.trim().toLowerCase().indexOf(normalizedLabel) !== -1;\n' +
                '            });\n' +
                '        });\n' +
                '        if (!field) return null;\n' +
                '        return field.id ? \'#\' + CSS.escape(field.id) : \'input[name="\' + field.name + \'"], textarea[name="\' + field.name + \'"]\';\n' +
                '    }, fieldLabel);\n' +
                '    if (!selector) throw new Error(\'Could not find the "\' + fieldLabel + \'" field\');\n' +
                '    await page.click(selector, { clickCount: 3 });\n' +
                '    await page.type(selector, value);\n' +
                '});';
        }
    },
    select: {
        keyword: 'When',
        text: function (m) { return 'I select "' + m.value + '" from the "' + m.label + '" dropdown'; },
        description: function (m) { return 'Finds the "' + m.label + '" dropdown and chooses the "' + m.value + '" option.'; },
        code: function () {
            return 'this.When(/^I select "([^"]*)" from the "([^"]*)" dropdown$/, async function (optionText, fieldLabel) {\n' +
                '    var selected = await page.evaluate(function (optionText, fieldLabel) {\n' +
                '        var normalizedLabel = fieldLabel.trim().toLowerCase();\n' +
                '        var select = Array.prototype.slice.call(document.querySelectorAll(\'select\')).find(function (el) {\n' +
                '            var labels = Array.prototype.slice.call(document.querySelectorAll(\'label[for="\' + el.id + \'"]\'));\n' +
                '            var text = labels.map(function (l) { return l.textContent; }).join(\' \');\n' +
                '            return [el.name, el.id, el.getAttribute(\'aria-label\'), text].some(function (attr) {\n' +
                '                return attr && attr.trim().toLowerCase().indexOf(normalizedLabel) !== -1;\n' +
                '            });\n' +
                '        });\n' +
                '        if (!select) return false;\n' +
                '        var option = Array.prototype.slice.call(select.options).find(function (o) { return o.text.trim().toLowerCase() === optionText.trim().toLowerCase(); });\n' +
                '        if (!option) return false;\n' +
                '        select.value = option.value;\n' +
                '        select.dispatchEvent(new Event(\'change\', { bubbles: true }));\n' +
                '        return true;\n' +
                '    }, optionText, fieldLabel);\n' +
                '    if (!selected) throw new Error(\'Could not select "\' + optionText + \'" from the "\' + fieldLabel + \'" dropdown\');\n' +
                '});';
        }
    },
    check: {
        keyword: 'When',
        text: function (m) { return 'I check the "' + m.label + '" checkbox'; },
        description: function (m) { return 'Finds the "' + m.label + '" checkbox and ticks it if it is not already checked.'; },
        code: function () {
            return 'this.When(/^I check the "([^"]*)" checkbox$/, async function (fieldLabel) {\n' +
                '    var checked = await page.evaluate(function (label) {\n' +
                '        var normalizedLabel = label.trim().toLowerCase();\n' +
                '        var box = Array.prototype.slice.call(document.querySelectorAll(\'input[type="checkbox"]\')).find(function (el) {\n' +
                '            var labels = Array.prototype.slice.call(document.querySelectorAll(\'label[for="\' + el.id + \'"]\'));\n' +
                '            var text = labels.map(function (l) { return l.textContent; }).join(\' \');\n' +
                '            return [el.name, el.id, el.getAttribute(\'aria-label\'), text].some(function (attr) {\n' +
                '                return attr && attr.trim().toLowerCase().indexOf(normalizedLabel) !== -1;\n' +
                '            });\n' +
                '        });\n' +
                '        if (!box) return false;\n' +
                '        if (!box.checked) box.click();\n' +
                '        return true;\n' +
                '    }, fieldLabel);\n' +
                '    if (!checked) throw new Error(\'Could not find the "\' + fieldLabel + \'" checkbox\');\n' +
                '});';
        }
    },
    uncheck: {
        keyword: 'When',
        text: function (m) { return 'I uncheck the "' + m.label + '" checkbox'; },
        description: function (m) { return 'Finds the "' + m.label + '" checkbox and clears it if it is currently checked.'; },
        code: function () {
            return 'this.When(/^I uncheck the "([^"]*)" checkbox$/, async function (fieldLabel) {\n' +
                '    var unchecked = await page.evaluate(function (label) {\n' +
                '        var normalizedLabel = label.trim().toLowerCase();\n' +
                '        var box = Array.prototype.slice.call(document.querySelectorAll(\'input[type="checkbox"]\')).find(function (el) {\n' +
                '            var labels = Array.prototype.slice.call(document.querySelectorAll(\'label[for="\' + el.id + \'"]\'));\n' +
                '            var text = labels.map(function (l) { return l.textContent; }).join(\' \');\n' +
                '            return [el.name, el.id, el.getAttribute(\'aria-label\'), text].some(function (attr) {\n' +
                '                return attr && attr.trim().toLowerCase().indexOf(normalizedLabel) !== -1;\n' +
                '            });\n' +
                '        });\n' +
                '        if (!box) return false;\n' +
                '        if (box.checked) box.click();\n' +
                '        return true;\n' +
                '    }, fieldLabel);\n' +
                '    if (!unchecked) throw new Error(\'Could not find the "\' + fieldLabel + \'" checkbox\');\n' +
                '});';
        }
    },
    radio: {
        keyword: 'When',
        text: function (m) { return 'I select the "' + m.label + '" option'; },
        description: function (m) { return 'Finds the "' + m.label + '" radio option and selects it.'; },
        code: function () {
            return 'this.When(/^I select the "([^"]*)" option$/, async function (fieldLabel) {\n' +
                '    var selected = await page.evaluate(function (label) {\n' +
                '        var normalizedLabel = label.trim().toLowerCase();\n' +
                '        var radio = Array.prototype.slice.call(document.querySelectorAll(\'input[type="radio"]\')).find(function (el) {\n' +
                '            var labels = Array.prototype.slice.call(document.querySelectorAll(\'label[for="\' + el.id + \'"]\'));\n' +
                '            var text = labels.map(function (l) { return l.textContent; }).join(\' \');\n' +
                '            return [el.name, el.id, el.getAttribute(\'aria-label\'), text].some(function (attr) {\n' +
                '                return attr && attr.trim().toLowerCase().indexOf(normalizedLabel) !== -1;\n' +
                '            });\n' +
                '        });\n' +
                '        if (!radio) return false;\n' +
                '        radio.click();\n' +
                '        return true;\n' +
                '    }, fieldLabel);\n' +
                '    if (!selected) throw new Error(\'Could not find the "\' + fieldLabel + \'" option\');\n' +
                '});';
        }
    },
    assert: {
        keyword: 'Then',
        text: function (m) { return 'I should see the "' + m.value + '" message'; },
        description: function (m) { return 'Checks that the highlighted text "' + m.value + '" appears somewhere on the page.'; },
        code: function () {
            return 'this.Then(/^I should see the "([^"]*)" message$/, async function (expectedText) {\n' +
                '    await page.waitForFunction(function (text) {\n' +
                '        return document.body && document.body.innerText.toLowerCase().indexOf(text.toLowerCase()) !== -1;\n' +
                '    }, { timeout: DEFAULT_TIMEOUT }, expectedText);\n' +
                '});';
        }
    }
};

// Turns a raw interaction (kind + label/value from the page) into a session
// event: the Gherkin step text, whether it already has a runnable step
// definition, and — if not — a suggested one the user can request.
function processRecordedInteraction(session, raw) {
    var template = raw && STEP_TEMPLATES[raw.kind];
    if (!template) return;
    var text = template.text(raw);
    var defined = isStepDefined(text);
    var event = { keyword: template.keyword, text: text, defined: defined, needsStep: !defined };
    if (!defined) {
        event.suggestion = { description: template.description(raw), code: template.code(raw) };
    }
    session.events.push(event);
}

// Any interaction recorded before the user requested a matching step (or in
// another concurrent session) should flip to "defined" the moment that step
// exists, without waiting for a fresh interaction.
function refreshPendingSteps() {
    Object.keys(recordSessions).forEach(function (id) {
        (recordSessions[id].events || []).forEach(function (event) {
            if (event.needsStep && isStepDefined(event.text)) {
                event.defined = true;
                event.needsStep = false;
            }
        });
    });
}

function indentCode(code) {
    return String(code || '').split('\n').map(function (line) { return line ? '    ' + line : line; }).join('\n');
}

// Appends a newly requested step definition to a dedicated, always-loaded file
// so it's immediately usable in test runs with no server restart.
function appendStepDefinition(code) {
    var filePath = path.join(STEP_DEFINITIONS_DIR, 'recorded-steps.js');
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, 'module.exports = function () {\n\n' + indentCode(code) + '\n\n};\n', 'utf8');
    }
    else {
        var content = fs.readFileSync(filePath, 'utf8');
        var closingIndex = content.lastIndexOf('};');
        if (closingIndex === -1) throw new Error('recorded-steps.js is not in the expected format — fix or remove it, then try again.');
        content = content.slice(0, closingIndex) + indentCode(code) + '\n\n' + content.slice(closingIndex);
        fs.writeFileSync(filePath, content, 'utf8');
    }
    return path.relative(root, filePath).replace(/\\/g, '/');
}

function startRecordSession(rawUrl, response) {
    if (!puppeteer) {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'puppeteer is not installed on the server.' }));
        return;
    }
    if (!hasDisplay()) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'Recording needs a visible desktop — this machine has no display available.' }));
        return;
    }
    var executablePath = resolveChromeExecutable();
    if (!executablePath) {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'No Chrome installation could be found to launch for recording.' }));
        return;
    }
    var target = String(rawUrl || '').trim();
    if (!target) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'A URL is required to start recording.' }));
        return;
    }
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

    var sessionId = 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var session = { events: [], closed: false, browser: null, error: null };
    recordSessions[sessionId] = session;
    processRecordedInteraction(session, { kind: 'navigate', value: target });

    puppeteer.launch({
        headless: false,
        executablePath: executablePath,
        defaultViewport: null,
        args: ['--start-maximized']
    }).then(function (browser) {
        session.browser = browser;
        browser.on('disconnected', function () { session.closed = true; });
        return browser.pages();
    }).then(function (pages) {
        var page = pages[0] || null;
        if (!page) throw new Error('Recording browser opened with no page.');
        page.on('close', function () { session.closed = true; });
        var lastUrl = target;
        page.on('framenavigated', function (frame) {
            if (frame !== page.mainFrame()) return;
            var newUrl = frame.url();
            if (newUrl && newUrl !== 'about:blank' && newUrl !== lastUrl) {
                lastUrl = newUrl;
                processRecordedInteraction(session, { kind: 'landed', value: newUrl });
            }
        });
        return page.exposeFunction('__recordStep', function (step) {
            processRecordedInteraction(session, step);
        }).then(function () {
            return page.evaluateOnNewDocument(recorderPageInit);
        }).then(function () {
            return page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
        });
    }).catch(function (error) {
        session.closed = true;
        session.error = error && error.message ? error.message : String(error);
        if (session.browser) session.browser.close().catch(function () {});
    });

    response.writeHead(202, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ sessionId: sessionId, events: session.events }));
}

function requestStepForEvent(sessionId, eventIndex, response) {
    var session = recordSessions[sessionId];
    var event = session && session.events[eventIndex];
    if (!event) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'Recording step not found.' }));
        return;
    }
    if (!event.needsStep || !event.suggestion) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ event: event, file: null }));
        return;
    }
    try {
        // re-check in case this exact step was added moments ago (another
        // request, or the same one double-submitted) — never write a duplicate
        // pattern, since cucumber-js treats two matching patterns as ambiguous.
        var file = isStepDefined(event.text) ? null : appendStepDefinition(event.suggestion.code);
        event.defined = true;
        event.needsStep = false;
        refreshPendingSteps();
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ event: event, file: file }));
    }
    catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: error.message }));
    }
}

function stopRecordSession(sessionId, response) {
    var session = recordSessions[sessionId];
    if (!session) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'Recording session not found.' }));
        return;
    }
    var events = session.events.slice();
    delete recordSessions[sessionId];
    var closeBrowser = session.browser ? session.browser.close().catch(function () {}) : Promise.resolve();
    closeBrowser.then(function () {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ events: events }));
    });
}

// best-effort cleanup so an interrupted server doesn't leave a recording
// Chrome window orphaned behind it
function closeAllRecordSessions() {
    Object.keys(recordSessions).forEach(function (id) {
        var session = recordSessions[id];
        if (session && session.browser) { try { session.browser.close(); } catch (error) {} }
    });
}
process.on('exit', closeAllRecordSessions);
process.on('SIGINT', function () { closeAllRecordSessions(); process.exit(); });
process.on('SIGTERM', function () { closeAllRecordSessions(); process.exit(); });

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

    // Resolve the tag the user wants to run. If a tag is provided, it must exist (or
    // map to @featTest for legacy @feat). The user can provide BOTH a specific feature
    // AND a tag — in that case we run only tagged scenarios inside that file.
    var tag = requestedRunTag(requestedTag, features);
    var runAllInFeature = selectedFeature && !tag;

    if (!selectedFeature && !tag) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'No scenarios currently use ' + (requestedTag || 'this tag') + '.' }));
        return;
    }

    stopRequested = false;
    // the client may have stale env state — clamp headed runs to machines that actually have a desktop
    headless = headless === true || headless === undefined || !hasDisplay();

    var runLabel;
    if (tag && selectedFeature) runLabel = 'Running ' + tag + ' in ' + path.basename(featureFile);
    else if (tag) runLabel = 'Running ' + tag;
    else runLabel = 'Running all scenarios in ' + path.basename(featureFile);

    activeRun = { status: 'running', tag: tag || null, requestedTag: requestedTag || null, featureFile: featureFile || null, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, message: runLabel };
    var runnerArgs = [path.join(root, 'index.js'), '--disableLaunchReport'];
    if (headless) {
        runnerArgs.push('--headless');
    }
    // --allScenarios bypasses cucumber --tags filtering, so only enable it when the user
    // explicitly wants EVERY scenario of a specific file with no tag filter.
    if (runAllInFeature) {
        runnerArgs.push('--allScenarios');
    }
    if (selectedFeature) {
        runnerArgs.push('--featureFiles', path.join(root, featureFile));
    }
    if (tag) {
        runnerArgs.push('--tags', tag);
    }
    // windowsHide only for headless runs — a headed run must be able to show the browser window
    var runnerLogPath = path.join(reports, 'runner-last-run.log');
    var runnerLog = fs.createWriteStream(runnerLogPath);
    // the 'ipc' channel carries live-view frames of the test browser (see runtime/live-view.js)
    var runner = childProcess.spawn(process.execPath, runnerArgs, { cwd: root, windowsHide: headless, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: process.platform !== 'win32' });
    runner.stdout.pipe(runnerLog, { end: false });
    runner.stderr.pipe(runnerLog, { end: false });
    liveFrame = null;
    runner.on('message', function (message) {
        if (message && message.type === 'liveFrame') {
            liveFrame = { data: message.data, url: message.url, at: Date.now() };
        }
    });
    activeRun.logFile = 'features/reports/runner-last-run.log';
    runnerProcess = runner;
    activeRun.pid = runner.pid;
    activeRun.headless = headless;
    runner.on('close', function (code) {
        runnerLog.end();
        liveFrame = null;
        if (stopRequested) {
            stopRequested = false;
            runnerProcess = null;
            resetProgress();
            activeRun = { status: 'idle', tag: null, requestedTag: null, featureFile: null, startedAt: activeRun.startedAt, finishedAt: new Date().toISOString(), exitCode: null, message: 'Run stopped by user' };
            return;
        }
        runnerProcess = null;
        // Always reconcile progress.json so stuck "running" badges get finalized,
        // regardless of whether the runner exited normally or crashed.
        var reconciled = finalizeProgress(code == null ? 1 : code);
        var crashed = code !== 0 && reconciled;
        activeRun.status = code === 0 ? 'complete' : 'failed';
        activeRun.exitCode = code;
        activeRun.finishedAt = new Date().toISOString();
        activeRun.message = code === 0 ? 'Run complete' : (crashed ? 'Runner crashed before finishing — see features/reports/runner-last-run.log' : 'Run finished with failures');
    });
    response.writeHead(202, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(activeRun));
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

function writeJson(filePath, value) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(value));
    }
    catch (error) {}
}

function resetProgress() {
    writeJson(path.join(reports, 'progress.json'), {
        status: 'idle',
        current: null,
        scenarios: [],
        counts: { passed: 0, failed: 0, running: 0, queued: 0 }
    });
}

// If the runner exited without finalizing progress.json, reconcile it so
// the badges don't stay stuck in a "running" state. Applies to both normal
// and abnormal exits.
function finalizeProgress(exitCode) {
    var progressPath = path.join(reports, 'progress.json');
    var progress = readJson(progressPath, null);
    if (!progress || !progress.scenarios) {
        resetProgress();
        return exitCode !== 0;
    }
    var mutated = false;
    var anyFailed = false;
    progress.scenarios = (progress.scenarios || []).map(function (scenario) {
        var sc = Object.assign({}, scenario);
        var steps = sc.steps || [];
        if (sc.status === 'running' || sc.status === 'queued') {
            mutated = true;
            var hasFailStep = steps.some(function (st) { return st.status === 'failed'; });
            sc.steps = steps.map(function (step) {
                if (step.status === 'running') {
                    return Object.assign({}, step, {
                        status: hasFailStep ? 'failed' : (exitCode === 0 ? 'passed' : 'failed'),
                        finishedAt: step.finishedAt || new Date().toISOString(),
                        duration: step.startedAt ? new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime() : 0
                    });
                }
                return step;
            });
            sc.status = hasFailStep ? 'failed' : (sc.status === 'queued' ? 'queued' : (exitCode === 0 ? 'passed' : 'failed'));
            sc.finishedAt = sc.finishedAt || new Date().toISOString();
            sc.duration = sc.startedAt ? new Date(sc.finishedAt).getTime() - new Date(sc.startedAt).getTime() : 0;
        }
        if (sc.status === 'failed') anyFailed = true;
        return sc;
    });
    if (progress.status === 'running' || progress.status === 'idle') {
        mutated = true;
        progress.status = (exitCode === 0 && !anyFailed) ? 'passed' : 'failed';
    }
    progress.current = null;
    progress.currentStep = null;
    progress.updatedAt = new Date().toISOString();
    var counts = { passed: 0, failed: 0, running: 0, queued: 0 };
    progress.scenarios.forEach(function (sc) {
        if (sc.status === 'passed') counts.passed += 1;
        else if (sc.status === 'failed') counts.failed += 1;
        else if (sc.status === 'running') counts.running += 1;
        else counts.queued += 1;
    });
    if (JSON.stringify(progress.counts) !== JSON.stringify(counts)) {
        progress.counts = counts;
        mutated = true;
    }
    if (mutated) {
        writeJson(progressPath, progress);
        return true;
    }
    return exitCode !== 0 && progress.status === 'running';
}

// Legacy alias — kept for clarity at the call site.
function finalizeAbnormalExit() {
    return finalizeProgress(1);
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

    if (requestPath === '/api/record/start' && request.method === 'POST') {
        var recordStartBody = '';
        request.on('data', function (chunk) { recordStartBody += chunk; });
        request.on('end', function () {
            var payload;
            try { payload = recordStartBody ? JSON.parse(recordStartBody) : {}; }
            catch (error) { payload = {}; }
            startRecordSession(payload.url, response);
        });
        return;
    }

    if (requestPath === '/api/record/events' && request.method === 'GET') {
        var recordQuery = new URL(request.url, 'http://localhost').searchParams;
        var recordSessionId = recordQuery.get('sessionId');
        var since = Number(recordQuery.get('since') || 0);
        var session = recordSessions[recordSessionId];
        if (!session) {
            response.writeHead(404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ message: 'Recording session not found.' }));
            return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ events: session.events.slice(since), total: session.events.length, closed: session.closed, error: session.error }));
        return;
    }

    if (requestPath === '/api/record/request-step' && request.method === 'POST') {
        var requestStepBody = '';
        request.on('data', function (chunk) { requestStepBody += chunk; });
        request.on('end', function () {
            var payload;
            try { payload = requestStepBody ? JSON.parse(requestStepBody) : {}; }
            catch (error) { payload = {}; }
            requestStepForEvent(payload.sessionId, Number(payload.eventIndex), response);
        });
        return;
    }

    if (requestPath === '/api/record/stop' && request.method === 'POST') {
        var recordStopBody = '';
        request.on('data', function (chunk) { recordStopBody += chunk; });
        request.on('end', function () {
            var payload;
            try { payload = recordStopBody ? JSON.parse(recordStopBody) : {}; }
            catch (error) { payload = {}; }
            stopRecordSession(payload.sessionId, response);
        });
        return;
    }

    if (requestPath === '/api/step-suggestions') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(stepSuggestions()));
        return;
    }

    if (requestPath === '/api/step-definitions' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ files: scanStepDefinitionFiles().sort(), steps: scanStepDefinitionBlocks() }));
        return;
    }

    if (requestPath === '/api/step-definition' && request.method === 'POST') {
        var stepDefBody = '';
        request.on('data', function (chunk) { stepDefBody += chunk; });
        request.on('end', function () {
            try {
                var payload = JSON.parse(stepDefBody || '{}');
                var keyword = String(payload.keyword || '').trim();
                if (['Given', 'When', 'Then'].indexOf(keyword) < 0) throw new Error('Choose a step keyword: Given, When, or Then.');
                var template = String(payload.template || '').trim();
                if (!template) throw new Error('Enter the step text.');
                var fileName = safeStepDefName(payload.file);
                if (!fileName) throw new Error('Enter a valid file name (letters, numbers, spaces, - and _, ending in .js).');

                var compiled = compileStepPattern(template);
                var isDuplicate = scanStepDefinitionSources().some(function (def) { return def.source === compiled.source; });
                if (isDuplicate) throw new Error('A step definition with this exact pattern already exists.');

                var bodyText = String(payload.body || '').trim() || '// TODO: implement this step';
                var indentedBody = bodyText.split('\n').map(function (line) { return '        ' + line; }).join('\n');
                var params = [];
                for (var i = 1; i <= compiled.paramCount; i++) params.push('param' + i);
                var block = '\n    this.' + keyword + '(/' + compiled.source + '/, async function (' + params.join(', ') + ') {\n' + indentedBody + '\n    });\n';

                var targetPath = path.join(STEP_DEFINITIONS_DIR, fileName);
                var current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : 'module.exports = function () {\n};\n';
                var closingMatch = current.match(/\n?\};\s*$/);
                if (!closingMatch) throw new Error('"' + fileName + '" is not in the expected module.exports = function () {...}; format — add the step manually.');
                var insertAt = current.length - closingMatch[0].length;
                var updated = current.slice(0, insertAt) + block + current.slice(insertAt);

                fs.mkdirSync(STEP_DEFINITIONS_DIR, { recursive: true });
                fs.writeFileSync(targetPath, updated, 'utf8');
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ ok: true, file: fileName, pattern: humanizeStepPattern(compiled.source), keyword: keyword }));
            }
            catch (error) {
                response.writeHead(400, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ message: error.message }));
            }
        });
        return;
    }

    if (requestPath === '/api/step-definition' && request.method === 'PUT') {
        var updateStepBody = '';
        request.on('data', function (chunk) { updateStepBody += chunk; });
        request.on('end', function () {
            try {
                var payload = JSON.parse(updateStepBody || '{}');
                var keyword = String(payload.keyword || '').trim();
                if (['Given', 'When', 'Then'].indexOf(keyword) < 0) throw new Error('Choose a step keyword: Given, When, or Then.');
                var template = String(payload.template || '').trim();
                if (!template) throw new Error('Enter the step text.');
                var fileName = safeStepDefName(payload.file);
                var targetPath = fileName && path.join(STEP_DEFINITIONS_DIR, fileName);
                if (!fileName || !fs.existsSync(targetPath)) throw new Error('Could not find the file this step lives in — refresh and try again.');

                var originalSource = String(payload.originalSource || '');
                var originalFlags = String(payload.originalFlags || '');
                var content = fs.readFileSync(targetPath, 'utf8');
                var blocks = extractStepBlocksFromContent(content);
                var target = blocks.find(function (b) { return b.source === originalSource && b.flags === originalFlags; });
                if (!target) throw new Error('Could not find that step in the file anymore — someone may have changed it. Refresh and try again.');

                var compiled = compileStepPattern(template);
                if (compiled.source !== originalSource) {
                    var isDuplicate = scanStepDefinitionSources().some(function (def) {
                        return def.source === compiled.source && !(def.file === fileName && def.source === originalSource && def.flags === originalFlags);
                    });
                    if (isDuplicate) throw new Error('A step definition with this exact pattern already exists.');
                }

                // Keep the original parameter names where possible (the body text being
                // edited still refers to them by name) — only fall back to generic paramN
                // names for newly-added placeholders the template didn't have before.
                var existingParams = target.params ? target.params.split(',').map(function (p) { return p.trim(); }).filter(Boolean) : [];
                var params = [];
                for (var i = 0; i < compiled.paramCount; i++) params.push(existingParams[i] || ('param' + (i + 1)));

                var bodyText = String(payload.body || '').trim() || '// TODO: implement this step';
                var indentedBody = bodyText.split('\n').map(function (line) { return '        ' + line; }).join('\n');
                var newBlock = 'this.' + keyword + '(/' + compiled.source + '/, async function (' + params.join(', ') + ') {\n' + indentedBody + '\n    });';

                var updatedContent = content.slice(0, target.blockStart) + newBlock + content.slice(target.blockEnd);
                fs.writeFileSync(targetPath, updatedContent, 'utf8');
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ ok: true, file: fileName, pattern: humanizeStepPattern(compiled.source), keyword: keyword }));
            }
            catch (error) {
                response.writeHead(400, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ message: error.message }));
            }
        });
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
                // Guarantee tags are normalized (always @-prefixed and well-formed) before writing
                // writing to disk, even if the user typed them without a leading `@`.
                edit.tags = normalizeTags(edit.tags || []);
                edit.scenarios = (edit.scenarios || []).map(function (scenario) {
                    var isOutline = scenario.isOutline === true || (Array.isArray(scenario.examples) && scenario.examples.length > 0);
                    var cleanExamples = Array.isArray(scenario.examples) ? scenario.examples.map(function (ex) {
                        if (!ex) return null;
                        var header = Array.isArray(ex.header) ? ex.header.map(function (h) { return String(h == null ? '' : h); }) : [];
                        var body = Array.isArray(ex.body) ? ex.body.map(function (row) {
                            return Array.isArray(row) ? row.map(function (c) { return String(c == null ? '' : c); }) : [];
                        }) : [];
                        return {
                            keyword: (ex.keyword || 'Examples').trim() || 'Examples',
                            name: String(ex.name || '').trim(),
                            tags: normalizeTags(ex.tags || []),
                            header: header,
                            body: body
                        };
                    }).filter(Boolean) : [];
                    return Object.assign({}, scenario, {
                        tags: normalizeTags(scenario.tags || []),
                        isOutline: isOutline,
                        examples: cleanExamples,
                        keyword: String(scenario.keyword || (isOutline ? 'Scenario Outline' : 'Scenario')).trim()
                    });
                });
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

    if (requestPath === '/api/feature' && request.method === 'DELETE') {
        var deleteFeaturePath = safeFeaturePath(new URL(request.url, 'http://localhost').searchParams.get('file'));
        if (!deleteFeaturePath || !fs.existsSync(deleteFeaturePath)) {
            response.writeHead(404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ message: 'Feature file not found.' }));
            return;
        }
        try {
            fs.unlinkSync(deleteFeaturePath);
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ ok: true }));
        }
        catch (error) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ message: error.message }));
        }
        return;
    }

    if (requestPath === '/api/folder' && request.method === 'POST') {
        var folderBody = '';
        request.on('data', function (chunk) { folderBody += chunk; });
        request.on('end', function () {
            try {
                var folderPayload = JSON.parse(folderBody || '{}');
                var relFolder = String(folderPayload.path || '').replace(/\\/g, '/').replace(/\/+$/, '');
                var validFolder = relFolder && relFolder.indexOf('..') < 0 && !path.isAbsolute(relFolder) &&
                    (relFolder === 'features' || relFolder.indexOf('features/') === 0);
                if (!validFolder) throw new Error('Invalid folder path.');
                fs.mkdirSync(path.join(root, relFolder), { recursive: true });
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ ok: true, path: relFolder }));
            }
            catch (error) {
                response.writeHead(400, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ message: error.message }));
            }
        });
        return;
    }

    if (requestPath === '/api/folder' && request.method === 'DELETE') {
        var relDeleteFolder = String(new URL(request.url, 'http://localhost').searchParams.get('path') || '').replace(/\\/g, '/').replace(/\/+$/, '');
        var validDeleteFolder = relDeleteFolder && relDeleteFolder.indexOf('..') < 0 && !path.isAbsolute(relDeleteFolder) &&
            relDeleteFolder !== 'features' && relDeleteFolder.indexOf('features/') === 0;
        if (!validDeleteFolder) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ message: 'Invalid folder path.' }));
            return;
        }
        var absoluteDeleteFolder = path.join(root, relDeleteFolder);
        if (!fs.existsSync(absoluteDeleteFolder) || !fs.statSync(absoluteDeleteFolder).isDirectory()) {
            response.writeHead(404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ message: 'Folder not found.' }));
            return;
        }
        try {
            fs.rmSync(absoluteDeleteFolder, { recursive: true, force: true });
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ ok: true }));
        }
        catch (error) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ message: error.message }));
        }
        return;
    }

    if (requestPath === '/api/run-status') {
        var progress = readJson(path.join(reports, 'progress.json'), { status: 'idle', scenarios: [] });
        var currentRun = activeRun;
        // Only trust progress.json's "running" if activeRun has no memory of a finished run
        // AND the progress record was updated recently (stale records from crashed/old runs
        // should not keep the UI stuck showing "running" after a server restart).
        if (currentRun.status === 'idle' && progress.status === 'running') {
            var stalenessMs = progress.updatedAt ? Date.now() - new Date(progress.updatedAt).getTime() : Infinity;
            var staleThreshold = 5 * 60 * 1000;
            if (!progress.updatedAt || stalenessMs < staleThreshold) {
                currentRun = { status: 'running', tag: null, requestedTag: null, startedAt: progress.startedAt, finishedAt: null, exitCode: null, message: 'Run in progress' };
            }
        }
        var runIsActive = currentRun.status === 'running';
        var runFeatures = discoverFeatures().map(function (feature) {
            var matching = (progress.scenarios || []).filter(function (scenario) { return formatFeaturePath(scenario.featureFile) === formatFeaturePath(feature.uri); });
            var anyRunning = matching.some(function (scenario) { return scenario.status === 'running'; });
            var allTerminal = matching.length > 0 && matching.every(function (scenario) { return scenario.status === 'passed' || scenario.status === 'failed'; });
            // If the overall run is no longer active, ignore stray "running" scenarios
            // because they're stale records that haven't been (or couldn't be) finalized.
            var status;
            if (runIsActive && anyRunning) {
                status = 'running';
            } else if (allTerminal || (!runIsActive && matching.length > 0)) {
                status = 'complete';
            } else if (matching.length === 0) {
                status = 'waiting';
            } else {
                status = 'waiting';
            }
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
            // Allow the UI to request ANY tag the user picked — the
            // requestedRunTag function normalizes it, validates it
            // against the actual feature files, and maps '@feat' to
            // '@featTest' (legacy behaviour) when needed.
            var requestedTag = normalizeTag(payload.tag) || null;
            startRun(requestedTag, payload.featureFile || '', payload.headless !== false, response);
        });
        return;
    }

    if (requestPath === '/api/stop' && request.method === 'POST') {
        if (activeRun.status !== 'running' || !activeRun.pid) {
            response.writeHead(409, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ message: 'No run is currently active.' }));
            return;
        }
        stopRequested = true;
        var pid = activeRun.pid;
        try {
            try { process.kill(-pid, 'SIGTERM'); }
            catch (groupError) { try { process.kill(pid, 'SIGTERM'); } catch (pidError) {} }
        }
        catch (error) {}
        // Guarantee termination — the runner may ignore SIGTERM.
        setTimeout(function () {
            try { process.kill(-pid, 'SIGKILL'); }
            catch (groupError) { try { process.kill(pid, 'SIGKILL'); } catch (pidError) {} }
        }, 1500).unref();
        resetProgress();
        activeRun = { status: 'idle', tag: null, requestedTag: null, featureFile: null, startedAt: activeRun.startedAt, finishedAt: new Date().toISOString(), exitCode: null, message: 'Run stopped by user' };
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'Run stopped.' }));
        return;
    }

    if (requestPath === '/api/env') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ headlessOnly: !hasDisplay(), platform: process.platform, node: process.version }));
        return;
    }

    // Latest live-view frame of the test browser. Pass ?since=<at of the last frame you got>
    // to receive only { active, at } when nothing has repainted since.
    if (requestPath === '/api/live' && request.method === 'GET') {
        var liveSince = Number(new URL(request.url, 'http://localhost').searchParams.get('since') || 0);
        var liveBody = { active: !!runnerProcess, at: liveFrame ? liveFrame.at : 0 };
        if (liveFrame && liveFrame.at > liveSince) Object.assign(liveBody, liveFrame);
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(liveBody));
        return;
    }

    // The dashboard UI lives in its own project (puppeteer-dashboard-web, hosted on
    // Vercel) and reaches this API through firebase-agent.js, so there's no page here.
    if (requestPath === '/') {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('This is the test API used by firebase-agent.js. The dashboard is hosted separately; see FIREBASE_SETUP.md.');
        return;
    }

    response.writeHead(404);
    response.end('Not found');
}).listen(port, '0.0.0.0', function () {
    console.log('Scenario progress dashboard listening on port ' + port);
});
