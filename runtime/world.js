/**
 * world.js is loaded by the cucumber framework before loading the step definitions and feature files
 * it is responsible for setting up and exposing the puppeteer/browser/page/assert etc required within each step definition
 */

var fs = require('fs-plus');
var path = require('path');
var chalk = require('chalk');
var expect = require('chai').expect;
var assert = require('chai').assert;
var reporter = require('cucumber-html-reporter');
var cucumberJunit = require('cucumber-junit');
var edgePaths = require('edge-paths');
var networkSpeeds = require('../runtime/network-speed.js');
var progress = require('../runtime/progress.js');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

var platform = process.platform;
var edgePath = '';

try {
    edgePath = (platform === 'darwin' || platform === 'win32') ? edgePaths.getEdgePath() : '';
}
catch (e) {
    console.log('Microsoft Edge not found');
}

var browserWidth = 1024;
var browserHeight = 768;

/**
 * log output to the console in a readable/visible format
 * @returns {void}
 */
function trace() {
    var args = [].slice.call(arguments);
    var output = chalk.bgBlue.white('\n>>>>> \n' + args + '\n<<<<<\n');

    console.log(output);
}

/**
 * Creates a list of variables to expose globally and therefore accessible within each step definition
 * @returns {void}
 */
function createWorld() {

    var runtime = {
        puppeteer: puppeteer,                       // the raw puppeteer object
        browser: null,                              // puppeteer browser object
        page: null,                                 // puppeteer page object
        expect: expect,                             // expose chai expect to allow variable testing
        assert: assert,                             // expose chai assert to allow variable testing
        trace: trace                                // expose an info method to log output to the console in a readable/visible format
    };

    // expose properties to step definition methods via global variables
    Object.keys(runtime).forEach(function (key) {
        if (key === 'driver' && browserTeardownStrategy !== 'always') {
            return;
        }

        // make property/method available as a global (no this. prefix required)
        global[key] = runtime[key];
    });
}

/**
 * Executes browser teardown strategy
 * @returns {Promise} resolves once teardown complete
 */
function teardownBrowser() {
    switch (browserTeardownStrategy) {
        case 'none':
            return Promise.resolve();
        case 'clear':
            return helpers.clearCookiesAndStorages();
        default:
            if (browser) {
                var browserToClose = browser;
                global.browser = null;
                global.page = null;

                return browserToClose.close().then(function () {
                    global.browser = null;
                    global.page = null;
                });
            }
            else {
                global.browser = null;
                global.page = null;
                return Promise.resolve();
            }
    }
}

// export the "World" required by cucumber to allow it to expose methods within step def's
module.exports = async function () {

    createWorld();
    progress.start();

    // this.World must be set!
    this.World = createWorld;

    // set the default timeout for all tests
    this.setDefaultTimeout(global.DEFAULT_TIMEOUT);

    // create the browser before scenario if it's not instantiated
    this.registerHandler('BeforeScenario', async function (scenario) {

        progress.beforeScenario(scenario);

        if (!global.browser) {
            var browserOptions = {
                headless: headless === true,
                product: browserName || 'chrome',
                defaultViewport: null,
                devtools: devTools === true,
                slowMo: global.DEFAULT_SLOW_MO, // slow down by specified ms so we can view in headful mode
                args: [
                    '--start-maximized',
                    // Standard automation flags — required for containerised/CI
                    // environments and prevents GPU/sandbox crashes on headless runs.
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            };

            if (browserPath === '' && browserName === 'chrome') {
                var bundledChromePath = puppeteer.executablePath();
                var systemChromePaths = [
                    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
                    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
                    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')
                ];

                if (!fs.existsSync(bundledChromePath)) {
                    var systemChromePath = systemChromePaths.find(function (candidatePath) {
                        return candidatePath && fs.existsSync(candidatePath);
                    });

                    if (systemChromePath) {
                        browserOptions.executablePath = systemChromePath;
                    }
                }
            }

            if (browserPath !== '') {
                delete browserOptions.product;
                browserOptions.executablePath = browserPath;
            }
            else if (browserName === 'edge') {
                delete browserOptions.product;
                browserOptions.executablePath = edgePath;
            }

            global.browser = await puppeteer.launch(browserOptions);
        }

        if (!global.page) {

            // chrome opens with exist tab
            var pages = await browser.pages();

            // using first tab
            global.page = pages[0];

            // throttle network if required
            if (global.networkSpeed) {

                // connect to dev tools
                var client = await page.target().createCDPSession();

                // set throttling
                await client.send('Network.emulateNetworkConditions', global.networkSpeed);
            }

            // set user agent if present
            if (userAgent !== '') {
                await page.setUserAgent(userAgent);
            }
        }
    });

    this.registerHandler('BeforeStep', function (step) {
        progress.beforeStep(step);
    });

    this.registerHandler('AfterStep', function (step) {
        progress.afterStep(step);
    });

    // failure detection + screenshots need the API scenario (isFailed/attach live here,
    // NOT on the ScenarioResult passed to registerHandler('AfterScenario'))
    this.After(async function (apiScenario) {
        if (page && typeof apiScenario.isFailed === 'function' && apiScenario.isFailed() && !global.noScreenshot) {
            var screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
            apiScenario.attach(Buffer.from(screenshot, 'base64'), 'image/png');
        }
    });

    this.registerHandler('AfterScenario', function (scenarioResult) {
        progress.afterScenario(scenarioResult);
    });

    this.registerHandler('AfterFeatures', function (features, done) {
        function didAllPass() {
            try {
                var cucumberReportPath = path.resolve(global.reportsPath, 'cucumber-report.json');
                if (fs.existsSync(cucumberReportPath)) {
                    var report = JSON.parse(fs.readFileSync(cucumberReportPath, 'utf8'));
                    var elements = (report || []).reduce(function (all, f) { return all.concat(f.elements || []); }, []);
                    var anyFailed = elements.some(function (el) {
                        return (el.steps || []).some(function (st) {
                            return st.result && st.result.status === 'failed';
                        });
                    });
                    return !anyFailed;
                }
            } catch (_) {}
            return true;
        }

        var succeeded = true;
        try {
            var cucumberReportPath = path.resolve(global.reportsPath, 'cucumber-report.json');

            if (global.reportsPath && fs.existsSync(global.reportsPath)) {

                // generate the HTML report
                var reportOptions = {
                    theme: 'bootstrap',
                    jsonFile: cucumberReportPath,
                    output: path.resolve(global.reportsPath, global.tag + '-cucumber-report.html'),
                    reportSuiteAsScenarios: true,
                    launchReport: (!global.disableLaunchReport),
                    ignoreBadJsonFile: true
                };

                reporter.generate(reportOptions);

                // grab the file data
                var reportRaw = fs.readFileSync(cucumberReportPath).toString().trim();
                var xmlReport = cucumberJunit(reportRaw);
                var junitOutputPath = path.resolve(global.reportsPath, 'junit-report.xml');

                fs.writeFileSync(junitOutputPath, xmlReport);
            }
            succeeded = didAllPass();
        } catch (err) {
            succeeded = false;
            try { console.error('AfterFeatures report error:', err && err.message ? err.message : err); } catch (_) {}
        } finally {
            try { progress.finish(succeeded); } catch (_) {}
        }

        teardownBrowser().then(done);
    });

};
