module.exports = function () {

    

    

    this.Then(/^I click on drop down menu "([^"]*)"$/, async function (text) {
        const element = await page.$('a[href="#layouts' + text + '"]');
        try {
            element.click();
            return true;
        } catch (error) {
           return false; 
        }
    });

    this.Then(/^I click on menu "([^"]*)"$/, async function (text) {
        const element = await page.waitForSelector('a[aria-label="' + text + '"]');
        try {
            element.click();
            return true;
        } catch (error) {
           return false; 
        }
    });

    this.Then(/^I click on button "([^"]*)"$/, async function (text) {
        let newText = text.replace(" ", "");

        try {
            // Wait for the iframe to load
            await page.waitForSelector('iframe');
            // Get the iframe element
            const iframeElement = await page.$('iframe');
            // Get the content frame of the iframe
            const iframeContentFrame = await iframeElement.contentFrame();
            // Find the button inside the iframe
            const buttonInsideIframe = await iframeContentFrame.$('#' + newText);
            // Click the button if found
            await buttonInsideIframe.click();
            return true;
        } catch (error) {
            //console.error();
            throw error;
        }
    });

    this.Then(/^I enter value "([^"]*)" on field "([^"]*)"$/, async function (value,field) {
        let newfield = field.replace(" ", "");
        var selector =  'input[id="' + newfield + '"]';
        try {
            // Wait for the iframe to load
            await page.waitForSelector('iframe');
            // Get the iframe element
            const iframeElement = await page.$('iframe');
            // Get the content frame of the iframe
            const iframeContentFrame = await iframeElement.contentFrame();

            await iframeContentFrame.focus(selector);
            if (value != "DNC" && value != "dnc")
              await iframeContentFrame.$eval(selector, el => el.value = '');
            // Find the button inside the iframe
            const buttonInsideIframe = await iframeContentFrame.$('#' + newfield);
            
            if (value != "Empty" && value != "empty" && value != "DNC" && value != "dnc")
              await buttonInsideIframe.type(value);
            return true;
        } catch (error) {
            //console.error(error);
            throw error;
        }
    });

    this.Then(/^I check if value "([^"]*)" is on screen$/, async function (textToCheck) {
        
        //const textToCheck = 'Text to check';
        // Wait for the iframe to load
        await page.waitForSelector('iframe');
        // Get the iframe element
        const iframeElement = await page.$('iframe');
        // Get the content frame of the iframe
        const iframeContentFrame = await iframeElement.contentFrame();

        try {
            await iframeContentFrame.waitForFunction(
              (text) => {
                // Search for the text in the entire document
                const elementsWithText = Array.from(document.querySelectorAll('*')).filter(element => {
                  // Check if the text exists in the inner text of the element
                  return element.innerText.includes(text);
                });
        
                // Return true if any elements contain the text, otherwise false
                return elementsWithText.length > 0;
              },
              { timeout: 5000 }, // Set a timeout in milliseconds (e.g., 5000 for 5 seconds)
              textToCheck
            );
        
            //console.log(`"${textToCheck}" is available on the screen.`);
            return true;
          } catch (error) {
            //console.log(`"${textToCheck}" is not available on the screen.`);
            throw `"${textToCheck}" is not available on the screen.`;
          }
        
    });

    this.Then(/^I check if value "([^"]*)" is not on screen$/, async function (textToCheck) {
        
        //const textToCheck = 'Text to check';
        // Wait for the iframe to load
       
        //await page.waitForSelector('iframe');
        //// Get the iframe element
        //const iframeElement = await page.$('iframe');
        //// Get the content frame of the iframe
        //const iframeContentFrame = await iframeElement.contentFrame();
//
        //try {
        //    await iframeContentFrame.waitForFunction(
        //      (text) => {
        //        // Search for the text in the entire document
        //        const elementsWithText = Array.from(document.querySelectorAll('*')).filter(element => {
        //          // Check if the text exists in the inner text of the element
        //          return element.innerText.includes(text);
        //        });
        //
        //        // Return true if any elements contain the text, otherwise false
        //        return elementsWithText.length > 0;
        //      },
        //      { timeout: 5000 }, // Set a timeout in milliseconds (e.g., 5000 for 5 seconds)
        //      textToCheck
        //    );
        //
        //    //console.log(`"${textToCheck}" is available on the screen.`);
        //    throw `"${textToCheck}" is available on the screen.`;
        //  } catch (error) {
        //    //console.log(`"${textToCheck}" is not available on the screen.`);
        //    return true;
        //  }
        
    });

    this.Then(/^I wait for a success alertBox appear$/, async function () {
        
        // Wait for the iframe to load
        await page.waitForSelector('iframe');
        // Get the iframe element
        const iframeElement = await page.$('iframe');
        // Get the content frame of the iframe
        const iframeContentFrame = await iframeElement.contentFrame();

        try {
            return iframeContentFrame.waitForSelector('#toast-success',{visible: true});
        } catch (error) {
            throw "alertBox is not present";
        }
        
    });

    this.Then(/^I wait for a danger alertBox appear$/, async function () {
        
        // Wait for the iframe to load
        await page.waitForSelector('iframe');
        // Get the iframe element
        const iframeElement = await page.$('iframe');
        // Get the content frame of the iframe
        const iframeContentFrame = await iframeElement.contentFrame();

        try {
            return iframeContentFrame.waitForSelector('#toast-danger',{visible: true});
        } catch (error) {
            throw "alertBox is not present";
        }
        
    });

    this.Then(/^I click on edit icon at row "([^"]*)" in table$/, async function (row) {
        
        // Wait for the iframe to load
        await page.waitForSelector('iframe');
        // Get the iframe element
        const iframeElement = await page.$('iframe');
        // Get the content frame of the iframe
        const iframeContentFrame = await iframeElement.contentFrame();

        let elements = await iframeContentFrame.$$('button[aria-label="Edit"]');
        
        
        let  Edit_button;
        // loop trough items
        for (let i = 0; i < elements.length; i++) {
            if ( (i + 1) == row)
            {
              Edit_button = elements[i];
            }
        }

        try {
            return Edit_button.click();
        } catch (error) {
            throw "Button was not found on the page."
        }
 
    });

    this.Then(/^I click on delete icon at row "([^"]*)" in table$/, async function (row) {
        
        // Wait for the iframe to load
        await page.waitForSelector('iframe');
        // Get the iframe element
        const iframeElement = await page.$('iframe');
        // Get the content frame of the iframe
        const iframeContentFrame = await iframeElement.contentFrame();

        let elements = await iframeContentFrame.$$('button[aria-label="Delete"]');
        
        
        let  Edit_button;
        // loop trough items
        for (let i = 0; i < elements.length; i++) {
            if ( (i + 1) == row)
            {
              Edit_button = elements[i];
            }
        }

        try {
            return Edit_button.click();
        } catch (error) {
            throw "Button was not found on the page."
        }
 
    });

    this.Then(/^I wait for "([^"]*)" seconds$/,async function (timeout) { 
        let newTimeout = timeout + "000";
        return await page.waitForTimeout(Number(newTimeout));
    });

    this.Then(/^I click on the checkbox with text "([^"]*)"$/,async function (text) { 
        // Wait for the iframe to load
        await page.waitForSelector('iframe');
        // Get the iframe element
        const iframeElement = await page.$('iframe');
        // Get the content frame of the iframe
        const iframeContentFrame = await iframeElement.contentFrame();

        

        try {
            if (text != "empty" && text != "Empty"){
                const checkbox = await iframeContentFrame.$('#' + text);
                return await checkbox.click();
            }else
                return true;
        } catch (error) {
            throw "checkbox with text '" + text + "' was not found on page";
        }
    });

    this.Then(/^I select this value "([^"]*)" on dropdown "([^"]*)" field$/,async function (value,field) { 
        // Wait for the iframe to load
        await page.waitForSelector('iframe');
        // Get the iframe element
        const iframeElement = await page.$('iframe');
        // Get the content frame of the iframe
        const iframeContentFrame = await iframeElement.contentFrame();

        try {
            await iframeContentFrame.evaluate((css, text) => {
                let sel = document.querySelector(css)
                for(let option of [...document.querySelectorAll(css + ' option')]){
    
                    console.log(option.text);
                  if(text == option.text){
                    sel.value = option.value
                  }
                }
            }, 'select[name="'+ field + '"]', value);
    
        } catch (error) {
            throw "dropdown field with text '" + text + "' was not found on page";
        }
    });

    this.Then(/^I skip this step$/,async function () { 
        return true;
    });

    this.Then(/^I click on button with text "([^"]*)" and select on image with "([^"]*)"$/, async function (text,value) { 
        
        const restaurantSelector = 'button'
        

        // Wait for the iframe to load
        await page.waitForSelector('iframe');
        // Get the iframe element
        const iframeElement = await page.$('iframe');
        // Get the content frame of the iframe
        const iframeContentFrame = await iframeElement.contentFrame();

        var button;
    
        let elements = await iframeContentFrame.$$(restaurantSelector);

        // loop trough items
        for (let i = 0; i < elements.length; i++) {
            let  button_text = await elements[i].evaluate(el => el.innerText);
            
            if ( button_text == text)
            {
              
              button = elements[i];
            }
        }
        
    if (value != "Empty" && value != "empty"){
        const [fileChooser] = await Promise.all([
            page.waitForFileChooser(),
            button.click()
          ]);

          return await fileChooser.accept([value]);;
    }else
        return true;

    });

};