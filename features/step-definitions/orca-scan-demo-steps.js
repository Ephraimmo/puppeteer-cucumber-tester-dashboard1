const { String } = require("cucumber/lib/cucumber/util");
const helpers    = require("puppeteer-cucumber-js/runtime/helpers");

module.exports = function () {


    async function typeAllChar(char,frame,selector){

        if (char == 'q')
          await frame.$eval(selector, el => el.value = el.value + "q");
        if (char == 'Q')
          await frame.$eval(selector, el => el.value = el.value + "Q");
        if (char == 'w')
          await frame.$eval(selector, el => el.value = el.value + "w");
        if (char == 'W')
          await frame.$eval(selector, el => el.value = el.value + "W");
        if (char == 'E')
          await frame.$eval(selector, el => el.value = el.value + "E");
        if (char == 'e')
          await frame.$eval(selector, el => el.value = el.value + "e");
        if (char == 'R')
          await frame.$eval(selector, el => el.value = el.value + "R");
        if (char == 'r')
          await frame.$eval(selector, el => el.value = el.value + "r");
        if (char == 'T')
          await frame.$eval(selector, el => el.value = el.value + "T");
        if (char == 't')
          await frame.$eval(selector, el => el.value = el.value + "t");
        if (char == 'Y')
          await frame.$eval(selector, el => el.value = el.value + "Y");
        if (char == 'y')
          await frame.$eval(selector, el => el.value = el.value + "y");
        if (char == 'U')
          await frame.$eval(selector, el => el.value = el.value + "U");
        if (char == 'u')
          await frame.$eval(selector, el => el.value = el.value + "u");
          if (char == 'I')
          await frame.$eval(selector, el => el.value = el.value + "I");
        if (char == 'i')
          await frame.$eval(selector, el => el.value = el.value + "i");
          if (char == 'O')
          await frame.$eval(selector, el => el.value = el.value + "O");
        if (char == 'o')
          await frame.$eval(selector, el => el.value = el.value + "o");
          if (char == 'P')
          await frame.$eval(selector, el => el.value = el.value + "P");
        if (char == 'p')
          await frame.$eval(selector, el => el.value = el.value + "p");
          if (char == '[')
          await frame.$eval(selector, el => el.value = el.value + "[");
        if (char == '{')
          await frame.$eval(selector, el => el.value = el.value + "{");
          if (char == ']')
          await frame.$eval(selector, el => el.value = el.value + "]");
        if (char == '}')
          await frame.$eval(selector, el => el.value = el.value + "]");
          if (char == ~'\~')
          await frame.$eval(selector, el => el.value = el.value + ~"\~");
        if (char == '|')
          await frame.$eval(selector, el => el.value = el.value + "|");

        //lower case
        if (char == 'A')
          await frame.$eval(selector, el => el.value = el.value + "A");
        if (char == 'S')
          await frame.$eval(selector, el => el.value = el.value + "S");
          if (char == 'D')
          await frame.$eval(selector, el => el.value = el.value + "D");
          if (char == 'F')
          await frame.$eval(selector, el => el.value = el.value + "F");
          if (char == 'G')
          await frame.$eval(selector, el => el.value = el.value + "G");
          if (char == 'H')
          await frame.$eval(selector, el => el.value = el.value + "H");
          if (char == 'J')
          await frame.$eval(selector, el => el.value = el.value + "J");
          if (char == 'K')
          await frame.$eval(selector, el => el.value = el.value + "K");
          if (char == 'L')
          await frame.$eval(selector, el => el.value = el.value + "L");
          if (char == ';')
          await frame.$eval(selector, el => el.value = el.value + ";");
          if (char == "'")
          await frame.$eval(selector, el => el.value = el.value + "'");
          if (char == '"')
          await frame.$eval(selector, el => el.value = el.value + '"');
          if (char == ':')
          await frame.$eval(selector, el => el.value = el.value + ':');
          if (char == "<")
          await frame.$eval(selector, el => el.value = el.value + "<");
          if (char == ',')
          await frame.$eval(selector, el => el.value = el.value + ',');
          if (char == '>')
          await frame.$eval(selector, el => el.value = el.value + '>');

          if (char == '.')
          await frame.$eval(selector, el => el.value = el.value + '.');
          if (char == '?')
          await frame.$eval(selector, el => el.value = el.value + '?');
          if (char == '/')
          await frame.$eval(selector, el => el.value = el.value + '/');

          if (char == 'Z')
          await frame.$eval(selector, el => el.value = el.value + 'Z');
          if (char == 'X')
          await frame.$eval(selector, el => el.value = el.value + 'X');
          if (char == 'C')
          await frame.$eval(selector, el => el.value = el.value + 'C');
          if (char == 'V')
          await frame.$eval(selector, el => el.value = el.value + 'V');
          if (char == 'B')
          await frame.$eval(selector, el => el.value = el.value + 'B');
          if (char == 'N')
          await frame.$eval(selector, el => el.value = el.value + 'N');
          if (char == 'M')
          await frame.$eval(selector, el => el.value = el.value + 'M');

          if (char == 'a')
          await frame.$eval(selector, el => el.value = el.value + 'a');
          if (char == 's')
          await frame.$eval(selector, el => el.value = el.value + 's');
          if (char == 'd')
          await frame.$eval(selector, el => el.value = el.value + 'd');
          if (char == 'f')
          await frame.$eval(selector, el => el.value = el.value + 'f');
          if (char == 'g')
          await frame.$eval(selector, el => el.value = el.value + 'g');
          if (char == 'h')
          await frame.$eval(selector, el => el.value = el.value + 'h');
          if (char == 'j')
          await frame.$eval(selector, el => el.value = el.value + 'j');
          if (char == 'k')
          await frame.$eval(selector, el => el.value = el.value + 'k');
          if (char == 'l')
          await frame.$eval(selector, el => el.value = el.value + 'l');
          if (char == 'z')
          await frame.$eval(selector, el => el.value = el.value + 'z');
          if (char == 'x')
          await frame.$eval(selector, el => el.value = el.value + 'x');
          if (char == 'c')
          await frame.$eval(selector, el => el.value = el.value + 'c');
          if (char == 'v')
          await frame.$eval(selector, el => el.value = el.value + 'v');
          if (char == 'b')
          await frame.$eval(selector, el => el.value = el.value + 'b');
          if (char == 'n')
          await frame.$eval(selector, el => el.value = el.value + 'n');
          if (char == 'm')
          await frame.$eval(selector, el => el.value = el.value + 'm');

          if (char == '!')
          await frame.$eval(selector, el => el.value = el.value + '!');
          if (char == '@')
          await frame.$eval(selector, el => el.value = el.value + '@');
          if (char == '#')
          await frame.$eval(selector, el => el.value = el.value + '#');
          if (char == '$')
          await frame.$eval(selector, el => el.value = el.value + '$');
          if (char == '%')
          await frame.$eval(selector, el => el.value = el.value + '%');
          if (char == '^')
          await frame.$eval(selector, el => el.value = el.value + '^');
          if (char == '&')
          await frame.$eval(selector, el => el.value = el.value + '&');
          if (char == '*')
          await frame.$eval(selector, el => el.value = el.value + '*');
          if (char == '(')
          await frame.$eval(selector, el => el.value = el.value + '(');
          if (char == ')')
          await frame.$eval(selector, el => el.value = el.value + ')');
          if (char == '_')
          await frame.$eval(selector, el => el.value = el.value + '_');
          if (char == '-')
          await frame.$eval(selector, el => el.value = el.value + '-');
          if (char == '+')
          await frame.$eval(selector, el => el.value = el.value + '+');
          if (char == '=')
          await frame.$eval(selector, el => el.value = el.value + '=');
          if (char == '~')
          await frame.$eval(selector, el => el.value = el.value + '~');

          if (char == '1')
          await frame.$eval(selector, el => el.value = el.value + '1');
          if (char == '2')
          await frame.$eval(selector, el => el.value = el.value + '2');
          if (char == '3')
          await frame.$eval(selector, el => el.value = el.value + '3');
          if (char == '4')
          await frame.$eval(selector, el => el.value = el.value + '4');
          if (char == '5')
          await frame.$eval(selector, el => el.value = el.value + '5');
          if (char == '6')
          await frame.$eval(selector, el => el.value = el.value + '6');
          if (char == '7')
          await frame.$eval(selector, el => el.value = el.value + '7');
          if (char == '8')
          await frame.$eval(selector, el => el.value = el.value + '8');
          if (char == '9')
          await frame.$eval(selector, el => el.value = el.value + '9');
          if (char == '0')
          await frame.$eval(selector, el => el.value = el.value + '0');
          if (char == ' ')
          await frame.$eval(selector, el => el.value = el.value + ' ');

    }

    this.Given(/^I am on the website$/, function() {
        page.setViewport({width: 1300, height: 1024});
        
        return helpers.loadPage(pageObjects.orcaScan.url);
    });
    
    this.Then(/^I am on the website with url "([^"]*)"$/, function(url) {
        return helpers.loadPage(url);
    });

    this.When(/^I click the Book a demo button$/, async function () {

        // click the book a demo button
        await page.click(pageObjects.orcaScan.selectors.bookADemoButton);

        // wait for calendly iframe to appear
        await page.waitForSelector(pageObjects.orcaScan.selectors.calendlyIFrame);
    });

    this.Then(/^I should be able to book a demo$/, function () {

        // check the calendly booking frame appears
        return page.$(pageObjects.orcaScan.selectors.calendlyIFrame);
    });

    this.Then(/^I login in on the website with email value "([^"]*)" and password value is "([^"]*)"$/, async function (email,pass) {
        var returnBool = true;
        try {
            
            // set focus to the search box
            await page.focus('input[name=email]');
            // enter the search query
            await page.keyboard.type(email, {delay: 0 });
            // set focus to the search box
            await page.focus('input[name=password]');
            // enter the search query
            await page.keyboard.type(pass, {delay: 0 });

            //await page.focus('input[name=password]');
            await page.click('input[id="Sign In"]');
            return returnBool;
        } catch (error) {
            return false;
        }

        

    });

    this.Then(/^I wait for the page to load$/, async function () {
         //await page.setDefaultTimeout(50000);
         return page.waitForNavigation();
     });

     //side meun functions click
     this.Then(/^I click on side meun button Dashboard$/, async function () { 
        return page.click('a[id="Change1"]');
    });
    this.Then(/^I click on side meun button Branches$/, async function () { 
        return page.click('a[id="Change2"]');
    });
    this.Then(/^I click on side meun button User$/, async function () { 
        return page.click('a[id="Change3"]');
    });
    this.Then(/^I go to register page$/, async function () { 
        return page.click('body > div.box > p > a');
    });
    this.Then(/^I click on side meun button Sign Out$/, async function () { 
        return page.click('a[id="Change5"]');
    });

    //I click on Add User/Branches
    this.Then(/^I click on button Add Branche$/, async function () { 
        await page.mainFrame().childFrames()[0].click("#AddStore");
        return  true;

    });
    this.Then(/^I click on button Add User$/, async function () { 
        await  page.mainFrame().childFrames()[1].click('#AddUser');
        return true;
    });

    //type Branche Name
    this.Then(/^I enter "([^"]*)" on branche name$/,async function(Text) { 
            
            console.log("name : " + Text);
            var frame = page.mainFrame().childFrames()[0];

            try {
                //await frame.waitForSelector("#CloseButton");
                //await frame.focus("#NameCate");
                //await frame.keyboard.type("karabo",{delay:500});
                await page.mainFrame().childFrames()[0].$eval('#NameCate', el => el.value = "branche name");
            } catch (error) {
                return false;
            }
    
            
     return true;
    });

    //type Branche Address
    this.Then(/^I enter value "([^"]*)" on field "([^"]*)" on side meun "([^"]*)"$/, async function (Text,field,meun) {

        var validation = true;
        var frame;
        var selector =  'input[name="' + field + '"]';


        if ("Branches" == meun || "Order" == meun)
        {
            frame = 0;
        }else if ("Users" == meun || "Completed" == meun)
        {
            frame = 1;
        }else if ("Report" == meun || "Category" == meun)
        {
            frame = 2;
        }else if ("Product" == meun){
            frame = 3;
        }
        else if ("Register" == meun)
        {
            frame = null;
            var selector =  'input[id="' + field + '"]';
        }
        console.log("frame : " + frame );
        if (frame != null)
        try {
            await page.mainFrame().childFrames()[frame].focus(selector);
            await page.mainFrame().childFrames()[frame].$eval(selector, el => el.value = '');
           
            for (let index = 0; index < Text.length; index++) {
                const char = Text[index];
                await typeAllChar(char,page.mainFrame().childFrames()[frame],selector);
            }

            return true;
        } catch (error) {
            return false;
        }

        if (frame == null)
        try {
            await page.focus(selector);
            await page.$eval(selector, el => el.value = '');
           
            for (let index = 0; index < Text.length; index++) {
                const char = Text[index];
                await typeAllChar(char,page,selector);
            }

            return true;
        } catch (error) {
            return false;
        }

        
            

    });

    //type Branche Address
    this.Then(/^I enter value "([^"]*)" on textarea "([^"]*)" on side meun "([^"]*)"$/, async function (Text,field,meun) {

        var validation = true;
        var frame;
        var selector =  'textarea[name="' + field + '"]';


        if ("Branches" == meun || "Order" == meun)
        {
            frame = 0;
        }else if ("Users" == meun || "Completed" == meun)
        {
            frame = 1;
        }else if ("Report" == meun || "Category" == meun)
        {
            frame = 2;
        }else if ("Product" == meun){
            frame = 3;
        }
        else if ("Register" == meun)
        {
            frame = null;
            var selector =  'input[id="' + field + '"]';
        }
        console.log("frame : " + frame );
        if (frame != null)
        try {
            await page.mainFrame().childFrames()[frame].focus(selector);
            await page.mainFrame().childFrames()[frame].$eval(selector, el => el.value = '');
           
            for (let index = 0; index < Text.length; index++) {
                const char = Text[index];
                await typeAllChar(char,page.mainFrame().childFrames()[frame],selector);
            }

            return true;
        } catch (error) {
            return false;
        }

        if (frame == null)
        try {
            await page.focus(selector);
            await page.$eval(selector, el => el.value = '');
           
            for (let index = 0; index < Text.length; index++) {
                const char = Text[index];
                await typeAllChar(char,page,selector);
            }

            return true;
        } catch (error) {
            return false;
        }

        
            

    });


    //I select image with path
    this.Then(/^I click on button with text "([^"]*)" and select on image with "([^"]*)" path on meun "([^"]*)"$/, async function (text,value,meun) { 
        
            const restaurantSelector = 'button'
            var i;

            if ("Branches" == meun || "Order" == meun)
            {
                i = 0;
            }else if ("Users" == meun || "Completed" == meun)
            {
                i = 1;
            }else if ("Report" == meun || "Category" == meun)
            {
                i = 2;
            }else if ("Product" == meun){
                i = 3;
            }

            let frames = await page.mainFrame().childFrames();
            var button;
        
            let elements = await frames[i].$$(restaurantSelector);

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
    
    
    //I click on add
    this.Then(/^I click on Add button$/,function () { 
        return page.mainFrame().childFrames()[0].click('#CloseButton');
    });

    //I click on add
    this.Then(/^I wait for upload to completed$/,async function () { 

        try {
            await page.on('response',async (response) => {
                console.log('url',response.url());
                page.waitFor(5000)
            });
        } catch (error) {
            return false;
        }
            return true;
         });

    

    //I click on add
    this.Then(/^I wait for a successfully alertBox on meun "([^"]*)"$/,async function (meun) { 
        var i;

        if ("Branches" == meun || "Order" == meun)
        {
            i = 0;
        }else if ("Users" == meun || "Completed" == meun)
        {
            i = 1;
        }else if ("Report" == meun || "Category" == meun)
        {
            i = 2;
        }else if ("Product" == meun){
            i = 3;
        }

        return page.mainFrame().childFrames()[i].waitForSelector('#toast-success');

        
    });

    //I click on add
    this.Then(/^I wait for a danger alertBox$/, function () { 
        return page.mainFrame().childFrames()[0].waitForSelector('#toast-danger');
    });

    //I click on add
    this.Then(/^I click on close button$/,function () { 
        return page.mainFrame().childFrames()[0].click('#CloseModal');
    });

    //I click on add
    this.Then(/^I click on button with text "([^"]*)" on side meun text this "([^"]*)"$/,async function (text,meun) { 
       
            const restaurantSelector = 'button'
            var i;

            if ("Branches" == meun || "Order" == meun)
            {
                i = 0;
            }else if ("Users" == meun || "Completed" == meun)
            {
                i = 1;
            }else if ("Report" == meun || "Category" == meun)
            {
                i = 2;
            }else if ("Product" == meun){
                i = 3;
            }
            
            let frames = await page.mainFrame().childFrames();
            var button;
        
            let elements = await frames[i].$$(restaurantSelector);
            
            // loop trough items
            for (let i = 0; i < elements.length; i++) {
                let  button_text = await elements[i].evaluate(el => el.innerText);
                
                if ( button_text == text)
                {
                  console.log(button_text);
                  button = elements[i];
                }
            }
        
            
            return await button.click();
    });

    //I click on add
    this.Then(/^I click side meun item with text "([^"]*)"$/,async function (text) { 
       
        try {

            const restaurantSelector = 'span[class="title"]'
            let elements = await page.$$(restaurantSelector);
            var button;
            // loop trough items
            for (let i = 0; i < elements.length; i++) {
                let  button_text = await elements[i].evaluate(el => el.innerText);
                console.log(button_text);
                if ( button_text == text)
                  button = elements[i];
            }
        
            return await button.click();
            
        } catch (error) {
            throw("jnckjdsnckjndks");
        }
    })

    this.Then(/^I click button with Text "([^"]*)" on row "([^"]*)" on the table on side meun "([^"]*)"$/,async function (text,row,meun) { 
       
            const restaurantSelector = 'button'
            const tagetSelector = '#example_length';
            var i;

            if ("Branches" == meun || "Order" == meun)
            {
                i = 0;
            }else if ("Users" == meun || "Completed" == meun)
            {
                i = 1;
            }else if ("Report" == meun || "Category" == meun)
            {
                i = 2;
            }else if ("Product" == meun){
                i = 3;
            }
            
            let frames = await page.mainFrame().childFrames();
            var button;
            var saveRow = parseInt(row); 
            var countRow = 0;

            await frames[i].waitForSelector("#example_length",{visible: true, timeout: 3000});
        
            let elements = await frames[i].$$(restaurantSelector);

            
            
            // loop trough items
            for (let i = 0; i < elements.length; i++) {
                let  button_text = await elements[i].evaluate(el => el.innerHTML);
                
                if ( button_text == text)
                {
                  countRow++;
                  if (countRow == saveRow)
                  {
                    button = elements[i];
                    console.log("button click: " + button_text);
                  }
                }
            }
        
            return await button.click();
    })

    this.Then(/^I wait for 5 seconds$/,async function () { 
        return await page.waitForTimeout(5000);
    });

    this.Then(/^I select this value "([^"]*)" on dropdown "([^"]*)" field the menu "([^"]*)"$/,async function (value,dropdown,meun) { 
        var i;
        console.log("dropdown : " + dropdown + " , value : " + value + " , meun : " + meun );
        if ("Branches" == meun || "Order" == meun)
        {
            i = 0;
        }else if ("Users" == meun || "Completed" == meun)
        {
            i = 1;
        }else if ("Report" == meun || "Category" == meun)
        {
            i = 2;
        }else if ("Product" == meun){
            i = 3;
        }
        console.log('value i :' + i);
        var frame = page.mainFrame().childFrames()[i];
        
        return await frame.evaluate((css, text) => {
            let sel = document.querySelector(css)
            console.log("option : " + sel);
            for(let option of [...document.querySelectorAll(css + ' option')]){

                console.log(option.value);
              if(text == option.text){
                sel.value = option.value
              }
            }
          }, 'select[name="'+ dropdown + '"]', value);
    });

    //I click on add
    this.Then(/^I confirm validation on "([^"]*)" field the menu "([^"]*)"$/,async function (text,meun) { 
        // return page.mainFrame().childFrames()[0];
        var i;
 
        if ("Branches" == meun || "Order" == meun)
        {
            i = 0;
        }else if ("Users" == meun || "Completed" == meun)
        {
            i = 1;
        }else if ("Report" == meun || "Category" == meun)
        {
            i = 2;
        }else if ("Product" == meun){
            i = 3;
        }
         var getAttribute = await page.mainFrame().childFrames()[0].$eval("#NameCate", el => el.getAttribute("required"));
         console.log("getAttribute : " + getAttribute);
         //return await page.mainFrame().childFrames()[i].$eval('input[name="' + text + '"]', e => e.blur());
         //return await page.mainFrame().childFrames()[i].$eval('input[name="' + text + '"]', e => e.blur());
         //return await page.mainFrame().childFrames()[0].$eval('#NameCate', e => e.blur());
         //return await page.mainFrame().childFrames()[i].evaluate(() => document.querySelector('#NameCate').getAttribute('required') === "true");
     });


     this.Then(/^I click on the checkbox with text "([^"]*)" on side meun text this "([^"]*)"$/,async function (text,meun) { 
       
        const restaurantSelector = 'input[name="' + text + '"]'
        var i;

        if ("Branches" == meun || "Order" == meun)
        {
            i = 0;
        }else if ("Users" == meun || "Completed" == meun)
        {
            i = 1;
        }else if ("Report" == meun || "Category" == meun)
        {
            i = 2;
        }else if ("Product" == meun){
            i = 3;
        }
        else if ("Register" == meun)
        {
            meun = null;

            restaurantSelector = 'input[id="checkbox"]';
        }
        
        let frames = await page.mainFrame().childFrames();
        
        if (meun != 'Register')
          return await frames[i].click(restaurantSelector);
        else
          return await page.click(restaurantSelector);
});


this.Then(/^I click on choose File "([^"]*)" field with image "([^"]*)"$/, async function (text,value) { 


    const [fileChooser] = await Promise.all([
      page.waitForFileChooser(),
      page.click("input[id='"+ text +"']")
    ]);
        
    return await fileChooser.accept([value]);;

});

 //type Branche Address
    this.Then(/^I enter date "([^"]*)" on field "([^"]*)"$/, async function (Text,field) {

      const daySelector = 'Input["'+ field + '"]';
      //await page.waitForSelector(daySelector);   
      
      //const elements = await page.$();
      //await page.focus(daySelector);
      //page.click(daySelector);
      //
      //await page.$eval(daySelector, el => el.value = '2021-03-02');
      //page.keyboard.type("2021-03-02")

      let dateString = await page.evaluate(
        d => new Date(d).toLocaleDateString(navigator.language, {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }),
        date.toISOString()
    );
    await page.$eval(daySelector,(e) => e.removeAttribute("readonly"));
    await page.type(daySelector, dateString)
    });

    this.Then(/^I click on button with text "([^"]*)"$/, async function (text) { 

        const restaurantSelector = 'button'
        
        let frames = await page;
        var button;
    
        let elements = await frames.$$(restaurantSelector);
        
        // loop trough items
        for (let i = 0; i < elements.length; i++) {
            let  button_text = await elements[i].evaluate(el => el.innerText);
            console.log(button_text);
            if ( button_text == text)
            {
              console.log(button_text);
              button = elements[i];
            }
        }

        return await button.click();
        // await button.click();

       //id="toast" returnawait page.$eval('#' + text, el => el.value = 'projectemail089@gmail.com');

    });

    //I click on add
    this.Then(/^I wait for a danger alertBox on meun "([^"]*)"$/,async function (meun) { 
        var i;

        if ("Branches" == meun || "Order" == meun)
        {
            i = 0;
        }else if ("Users" == meun || "Completed" == meun)
        {
            i = 1;
        }else if ("Report" == meun || "Category" == meun)
        {
            i = 2;
        }else if ("Product" == meun){
            i = 3;
        }

        return page.mainFrame().childFrames()[i].waitForSelector('#toast-danger');

        
    });

    //I click on add
    this.Then(/^I wait for email alertBox$/, function () { 
        return page.waitForSelector('#popup',{visible: true});
    });

    //I click on add
    this.Then(/^I click on button with text "([^"]*)" generate report$/,async function (text) { 
       
        const restaurantSelector = 'span'
        var i;

        let frames = await page.mainFrame().childFrames();
        var button;
    
        
        for (let y = 0; y < frames.length; y++) {
            let elements = await frames[y].$$(restaurantSelector);
            
            // loop trough items
            for (let i = 0; i < elements.length; i++) {
                let  button_text = await elements[i].evaluate(el => el.innerText);

                if ( button_text == text)
                {
                  console.log(button_text);
                  button = elements[i];
                }
            }
        }
    
        
        return await button.click();
});

//I click on add
this.Then(/^I search for "([^"]*)" on meun "([^"]*)"$/,async function (text,meun) { 
       
    const restaurantSelector = 'input[type="search"]'
    var i;

    let frames = await page.mainFrame().childFrames();
    if ("Branches" == meun || "Order" == meun)
    {
        i = 0;
    }else if ("Users" == meun || "Completed" == meun)
    {
        i = 1;
    }else if ("Report" == meun || "Category" == meun)
    {
        i = 2;
    }else if ("Product" == meun){
        i = 3;
    }
    let elements = await frames[i];

    for (let index = 0; index < text.length; index++) {
        const element = text[index];
        typeAllChar(element,elements,restaurantSelector);
    }

});
    
  //I click on add
  this.Then(/^I wait for a success alertBox$/, function () { 
    return page.mainFrame().childFrames()[0].waitForSelector('#toast-success',{visible: true});
});


//I click on add
this.Then(/^I confirm value is "([^"]*)" on card with text "([^"]*)"$/,async function (value,card) { 
    

   var stringIsIncluded = await page.$eval('div[id=' + card + ']', (elements) =>
      elements.innerHTML
    );

    if (stringIsIncluded == value)
       return true;
    else
       throw("value " + value + " was not found on card");

     //return await page.$(selector, value);
    
});

this.When(/^I search Google for "([^"]*)"$/, function (searchQuery) {

    // execute ./page-objects/google-search.js preformSearch method
    return pageObjects.googleSearch.preformSearch(searchQuery);
});

this.Then(/^I enter Google email "([^"]*)"$/, async function (email) {
    
    
  
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36'; 
    await page.setUserAgent(ua);
    await page.type('input[type="email"]', email);
    await page.keyboard.press('Enter');
   
      
});

this.Then(/^I enter Google password "([^"]*)"$/, async function (googlePassword) {
    
    await page.type('input[type="password"]', googlePassword);
   await page.keyboard.press('Enter');
      
});

this.Then(/^I search this "([^"]*)" on Google$/, async function (googleSearch ) {
    
    await page.type('#APjFqb', googleSearch);
    await page.keyboard.press('Enter');
      
});

this.Then(/^I click on link number "([^"]*)"$/, async function (LinkNumber) {
    
    await page.click("#rso > div:nth-child(" + LinkNumber + ") > div > div > div > div > div > div > div.yuRUbf > a > h3")

});

this.Then(/^I click "([^"]*)" type of google sheets template$/, async function (template) {
    var selector;
    if ( template == "Blank")
      selector = "#\:1i > div.docs-homescreen-templates-templateview-preview.docs-homescreen-templates-templateview-preview-showcase > img"
    if ( template == "To-do list")
      selector = "#\:30 > div.docs-homescreen-templates-templateview-preview.docs-homescreen-templates-templateview-preview-showcase > img"
    if ( template == "Annual budget")
      selector = "#\:31 > div.docs-homescreen-templates-templateview-preview.docs-homescreen-templates-templateview-preview-showcase > img"
    if ( template == "Monthly budget")
      selector = "#\:32 > div.docs-homescreen-templates-templateview-preview.docs-homescreen-templates-templateview-preview-showcase > img"
    
    await page.click(selector);

});

this.Then(/^I select the element with innerText "([^"]*)"$/, async function (innerText) {
     const element = await helpers.findElement(Object.By.xpath(`//*[text()='${innerText}']`)); 
     
     await element.click(); 
});

this.Then(/^I click on the email confrimation link$/, async function () {
    var selector = "span[class='bog']";
    await page.click("span",'Verify your email for project-218236841715');
    //#\:66 > 

});


this.Then(/^I confrim link$/, async function () {
    var selector = "a[target= '_blank']";

    const restaurantSelector = 'a'

    let elements = await page.$$(selector);
    console.log(elements.length);
    
    await elements[0].click();

});

this.Then(/^I click on firebase project number "([^"]*)"$/, async function (projectName) {
    var selector = 'div.top-projects-list > div:nth-of-type(2) div.project-id';

    let elements = await page.$(selector);
    var button;
    console.log(elements.length);

    page.waitForSelector('fire-navbar-item:nth-of-type(3) i');
    page.click('fire-navbar-item:nth-of-type(3) i');

    page.waitForSelector('tr:nth-of-type(1) edit-account-menu mat-icon');
    page.click('tr:nth-of-type(1) edit-account-menu mat-icon');

    page.waitForSelector('button:nth-of-type(3)');
    page.click('button:nth-of-type(3)');
    
});


// #main > fire-router-outlet > fire-landing > div > div.top-projects-list.ng-tns-c2694881609-22.ng-star-inserted > div:nth-child(3) > project-card > mat-card > div.project-id
//#main > fire-router-outlet > fire-landing > div > div.top-projects-list.ng-tns-c2694881609-22.ng-star-inserted > div:nth-child(4) > project-card > mat-card > div.project-display-name.ng-star-inserted
//#\:2d > span > span
//#\:2q > span > span
};
