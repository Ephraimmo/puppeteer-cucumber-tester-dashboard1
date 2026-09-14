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

    // Generic "click a card" step: unlike "I click on the ... button" (which requires
    // an exact match against a single button/link/input's full trimmed text), this
    // matches ANY element whose text *contains* the given text — handy for tiles/cards
    // that wrap a name alongside a badge, rating, description, price, etc., where the
    // whole clickable element's exact text would be long and brittle to hard-code
    // (e.g. a restaurant card whose <a> text is "Top Rated4.9Hearth Grill & SmokehouseWood-fired steaks...").
    // It finds the most specific element containing the text, then climbs to the
    // nearest clickable ancestor (a/button/[role=button|link]/[onclick]) and clicks that.
    this.When(/^I click on card that contains text "([^"]*)"$/, async function (cardText) {
        // Poll rather than check once: this step commonly runs right after a click
        // that triggers a client-side render (or a real navigation) with no reliable
        // "settled" signal beforehand, so the card can legitimately not exist in the
        // DOM yet on the very first check. (Each function below is passed to Puppeteer
        // and evaluated inside the browser on its own, so the matching logic is
        // duplicated rather than shared via a closure — a closure over the outer
        // Node.js scope wouldn't exist once serialized into the page.)
        try {
            await page.waitForFunction(function (needle) {
                var normalizedNeedle = needle.trim().toLowerCase();
                var candidates = Array.prototype.slice.call(document.querySelectorAll('body *')).filter(function (element) {
                    return element.textContent && element.textContent.trim().toLowerCase().indexOf(normalizedNeedle) !== -1;
                });
                candidates.sort(function (a, b) { return a.textContent.length - b.textContent.length; });
                return candidates.some(function (element) {
                    return !!element.closest('a, button, [role="button"], [role="link"], [onclick]');
                });
            }, { timeout: DEFAULT_TIMEOUT }, cardText);
        } catch (error) {
            throw new Error('Could not find a clickable card containing the text "' + cardText + '"');
        }

        var clicked = await page.evaluate(function (needle) {
            var normalizedNeedle = needle.trim().toLowerCase();

            // Every element whose text contains the needle — includes ancestors
            // (e.g. the whole card, the whole page) as well as the exact match itself.
            var candidates = Array.prototype.slice.call(document.querySelectorAll('body *')).filter(function (element) {
                return element.textContent && element.textContent.trim().toLowerCase().indexOf(normalizedNeedle) !== -1;
            });

            // Try the most specific (shortest text) match first, so we climb from the
            // actual name/label element rather than accidentally starting from a
            // container that happens to also contain the text (e.g. a list of cards).
            candidates.sort(function (a, b) { return a.textContent.length - b.textContent.length; });

            for (var i = 0; i < candidates.length; i++) {
                var card = candidates[i].closest('a, button, [role="button"], [role="link"], [onclick]');
                if (card) {
                    card.click();
                    return true;
                }
            }

            return false;
        }, cardText);

        if (!clicked) {
            throw new Error('Could not find a clickable card containing the text "' + cardText + '"');
        }
    });

    this.Given(/^I (?:was for|wait for) ajax to complete$/, waitForAjax);

    this.Then(/^I tab to the "([^\"]*)" tab$/, async function (tabText) {
        // Poll rather than check once: switching to a tab is a client-side React
        // re-render with no page navigation, so "wait for ajax to complete"
        // (which only checks document.readyState) gives no real signal here —
        // the tab can legitimately not exist in the DOM yet on the first check.
        try {
            await page.waitForFunction(function (text) {
                var elements = Array.prototype.slice.call(document.querySelectorAll('button, a, [role="tab"], [role="button"]'));
                return elements.some(function (element) {
                    var label = element.textContent || element.getAttribute('aria-label') || '';
                    var style = window.getComputedStyle(element);
                    return label.trim().toLowerCase() === text.trim().toLowerCase() &&
                        style.display !== 'none' && style.visibility !== 'hidden' &&
                        !element.disabled && !element.getAttribute('aria-disabled');
                });
            }, { timeout: DEFAULT_TIMEOUT }, tabText);
        } catch (error) {
            throw new Error('Could not find the "' + tabText + '" tab');
        }

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
        // Poll (like "I should see the ... message" above) instead of checking once:
        // this step commonly runs right after a client-side tab/view switch that has
        // no page navigation, so there is no reliable network/readyState signal that
        // the target field has finished rendering yet — a single snapshot check can
        // lose the race against a perfectly normal render delay.
        try {
            await page.waitForFunction(function (label) {
                var normalizedLabel = label.trim().toLowerCase();
                var fields = Array.prototype.slice.call(document.querySelectorAll('input, textarea'));
                return fields.some(function (element) {
                    var labels = Array.prototype.slice.call(document.querySelectorAll('label[for="' + element.id + '"]'));
                    var text = labels.map(function (item) { return item.textContent; }).join(' ');
                    return [element.name, element.id, element.placeholder, element.getAttribute('aria-label'), text].some(function (attribute) {
                        return attribute && attribute.trim().toLowerCase().indexOf(normalizedLabel) !== -1;
                    });
                });
            }, { timeout: DEFAULT_TIMEOUT }, fieldLabel);
        } catch (error) {
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
