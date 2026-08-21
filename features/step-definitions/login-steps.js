module.exports = function () {

    var waitForAjax = async function () {
        await page.waitForTimeout(1000);
        await page.waitForFunction(function () {
            return document.readyState === 'complete' && (!window.jQuery || window.jQuery.active === 0);
        }, { timeout: DEFAULT_TIMEOUT });
    };

    this.Given(/^I click on the "([^"]*)" button$/, async function (buttonText) {
        var clicked = await page.evaluate(function (text) {
            var elements = Array.prototype.slice.call(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
            var matchingElements = elements.filter(function (element) {
                var label = element.textContent || element.value || element.getAttribute('aria-label') || '';
                return label.trim().toLowerCase() === text.trim().toLowerCase();
            });
            var target = matchingElements.find(function (element) {
                return element.type === 'submit' || element.type === 'button' && element.tagName === 'INPUT';
            }) || matchingElements[0];

            if (target) {
                target.click();
                return true;
            }

            return false;
        }, buttonText);

        if (!clicked) {
            throw new Error('Could not find a visible button labelled "' + buttonText + '"');
        }
    });

    this.Given(/^I (?:was for|wait for) ajax to complete$/, waitForAjax);

    this.Then(/^I tab to the "([^\"]*)" tab$/, async function (tabText) {
        var clicked = await page.evaluate(function (text) {
            var elements = Array.prototype.slice.call(document.querySelectorAll('button, a, [role="tab"], [role="button"]'));
            var target = elements.find(function (element) {
                var label = element.textContent || element.getAttribute('aria-label') || '';
                var style = window.getComputedStyle(element);
                return label.trim().toLowerCase() === text.trim().toLowerCase() &&
                    style.display !== 'none' && style.visibility !== 'hidden' &&
                    !element.disabled && !element.getAttribute('aria-disabled');
            });

            if (target) {
                target.click();
                return true;
            }

            return false;
        }, tabText);

        if (!clicked) {
            throw new Error('Could not find the "' + tabText + '" tab');
        }
    });

    this.Given(/^I use the "([^"]*)" demo login$/, async function (accountName) {
        var clicked = await page.evaluate(function (name) {
            var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
            var target = buttons.find(function (button) {
                return button.textContent.trim().toLowerCase().indexOf(name.trim().toLowerCase()) !== -1;
            });

            if (target) {
                target.click();
                return true;
            }

            return false;
        }, accountName);

        if (!clicked) {
            throw new Error('Could not find the "' + accountName + '" demo login');
        }

        await page.waitForTimeout(1000);
    });

    this.Given(/^I enter "([^"]*)" into the "([^"]*)" field$/, async function (value, fieldLabel) {
        var selector = await page.evaluate(function (label) {
            var normalizedLabel = label.trim().toLowerCase();
            var fields = Array.prototype.slice.call(document.querySelectorAll('input, textarea'));
            var field = fields.find(function (element) {
                var labels = Array.prototype.slice.call(document.querySelectorAll('label[for="' + element.id + '"]'));
                var text = labels.map(function (item) { return item.textContent; }).join(' ');
                var attributes = [element.name, element.id, element.placeholder, element.getAttribute('aria-label'), text];
                return attributes.some(function (attribute) {
                    return attribute && attribute.trim().toLowerCase().indexOf(normalizedLabel) !== -1;
                });
            });

            if (!field) {
                return null;
            }

            if (field.id) {
                return '#' + CSS.escape(field.id);
            }

            return 'input[name="' + field.name + '"], textarea[name="' + field.name + '"]';
        }, fieldLabel);

        if (!selector) {
            throw new Error('Could not find the "' + fieldLabel + '" field');
        }

        await page.click(selector, { clickCount: 3 });
        await page.type(selector, value);
    });

    this.Then(/^I should see the "([^"]*)" message$/, async function (message) {
        await page.waitForFunction(function (expectedMessage) {
            return document.body && document.body.innerText.toLowerCase().indexOf(expectedMessage.toLowerCase()) !== -1;
        }, { timeout: DEFAULT_TIMEOUT }, message);
    });

    this.Then(/^I should see the "([^"]*)" field$/, async function (fieldLabel) {
        var selector = await page.evaluate(function (label) {
            var normalizedLabel = label.trim().toLowerCase();
            var fields = Array.prototype.slice.call(document.querySelectorAll('input, textarea'));
            var field = fields.find(function (element) {
                var labels = Array.prototype.slice.call(document.querySelectorAll('label[for="' + element.id + '"]'));
                var text = labels.map(function (item) { return item.textContent; }).join(' ');
                return [element.name, element.id, element.placeholder, element.getAttribute('aria-label'), text].some(function (attribute) {
                    return attribute && attribute.trim().toLowerCase().indexOf(normalizedLabel) !== -1;
                });
            });

            return field ? field.id || field.name || field.tagName.toLowerCase() : null;
        }, fieldLabel);

        if (!selector) {
            throw new Error('Could not find the "' + fieldLabel + '" field');
        }
    });

    this.Then(/^the "([^"]*)" field should be masked$/, async function (fieldLabel) {
        var isMasked = await page.evaluate(function (label) {
            var normalizedLabel = label.trim().toLowerCase();
            var field = Array.prototype.slice.call(document.querySelectorAll('input, textarea')).find(function (element) {
                return [element.name, element.id, element.placeholder, element.getAttribute('aria-label')].some(function (attribute) {
                    return attribute && attribute.trim().toLowerCase().indexOf(normalizedLabel) !== -1;
                });
            });

            return field && field.type === 'password';
        }, fieldLabel);

        if (!isMasked) {
            throw new Error('The "' + fieldLabel + '" field is not masked');
        }
    });

    this.Then(/^the password should not be exposed in the URL or browser storage$/, async function () {
        var exposed = await page.evaluate(function () {
            var storageValues = [localStorage, sessionStorage].reduce(function (values, storage) {
                return values.concat(Object.keys(storage).map(function (key) { return storage.getItem(key); }));
            }, []);
            return window.location.href.toLowerCase().indexOf('ephraim@217377781') !== -1 ||
                storageValues.some(function (value) {
                    return value && value.toLowerCase().indexOf('ephraim@217377781') !== -1;
                });
        });

        if (exposed) {
            throw new Error('The password was exposed in the URL or browser storage');
        }
    });

    this.Then(/^the "([^"]*)" field should be invalid$/, async function (fieldLabel) {
        var isInvalid = await page.evaluate(function (label) {
            var normalizedLabel = label.trim().toLowerCase();
            var field = Array.prototype.slice.call(document.querySelectorAll('input, textarea')).find(function (element) {
                return [element.name, element.id, element.placeholder].some(function (attribute) {
                    return attribute && attribute.trim().toLowerCase().indexOf(normalizedLabel) !== -1;
                });
            });

            return field ? !field.checkValidity() : false;
        }, fieldLabel);

        if (!isInvalid) {
            throw new Error('The "' + fieldLabel + '" field is valid');
        }
    });
};
