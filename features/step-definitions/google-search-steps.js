module.exports = function () {

    this.Given(/^I am online at "([^"]*)"/, function (url) {
        return helpers.openPage(url);
    });

    this.Then(/^I should see "([^"]*)" in the results$/, function (keywords) {

        // resolves if an item on the page contains text
        return helpers.waitForLinkText(keywords, false, 30);
    });

    this.Then(/^I should go back one page$/, function () {
        return page.goBack();
    });
};
