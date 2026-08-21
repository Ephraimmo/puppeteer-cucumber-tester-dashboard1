Feature: Login And Register Page

  Background: Open the customer app
    When I am online at "https://customerapp-neon.vercel.app/"
    And I click on the "ACCOUNT" button
    And I wait for ajax to complete
    And I click on the "SIGN IN" button
    And I wait for ajax to complete

  @customerapp
  Scenario: User attempts to Register - form is available

    Then I tab to the "REGISTER" tab
    And I wait for ajax to complete

    Then I should see the "Full Name *" field
    And I should see the "Email *" field
    And I should see the "Phone (optional)" field
    And I should see the "Password *" field
    And I should see the "CREATE ACCOUNT" message
   
  @feat
  @customerapp 
  Scenario: User attempts to login with valid credentials

    Then I tab to the "REGISTER" tab
    And I wait for ajax to complete

    Then I enter "nkanyezisecurity" into the "Full Name *" field
    And I wait for ajax to complete
    And I enter "nkanyezisecurity@gmail.com" into the "Email *" field
    And I wait for ajax to complete
    And I enter "+27824815280" into the "Phone (optional)" field
    And I wait for ajax to complete
    And I enter "Ephraim@217377781" into the "Password *" field
    And I wait for ajax to complete
    And I click on the "CREATE ACCOUNT" button
    And I wait for ajax to complete

    #validate that the user is logged in by checking for a specific element or message
    Then I should see the "SIGN OUT" message


  @customerapp
  Scenario: User attempts to login - form is available

    Then I should see the "Email" field
    And I should see the "Password" field
    And I should see the "SIGN IN" message

  @customerapp 
  Scenario: User attempts to login with valid credentials

    Then I enter "demo@hearth.app" into the "Email" field
    And I wait for ajax to complete
    And I enter "hearth123" into the "Password" field
    And I wait for ajax to complete
    And I click on the "SIGN IN" button
    And I wait for ajax to complete

    #validate that the user is logged in by checking for a specific element or message
    Then I should see the "SIGN OUT" message

  

  @customerapp @valid
  Scenario Outline: User attempts to login with invalid credentials - <CheckPointType>
    And I enter "<Email>" into the "Email" field
    And I enter "<Password>" into the "Password" field
    And I click on the "SIGN IN" button
    And I wait for ajax to complete

    #validation
    Then I should see the "<CheckPointValue>" message

    Examples:
      |CheckPointType            | Email                      | Password          |CheckPointValue          |
      |Invalid Email and Password| nkanyezisecurit@gmail.com  | Ephraim@21737778  |Invalid email or password|
      |Invalid Email             | nkanyezisecurit@gmail.com  | Ephraim@217377781 |Invalid email or password|
      |Empty Email and Password  | Empty                      | Empty             |Invalid email or password|
      |Empty Email               | Empty                      | Ephraim@21737778  |Invalid email or password|
      |Empty Password            | nkanyezisecurity@gmail.com | Empty             |Invalid email or password|


