Feature: Login And Register Page

  Background: Background name
    When I am online at "https://customerapp-neon.vercel.app/"
    And I click on the "ACCOUNT" button
    And I wait for ajax to complete
    And I click on the "SIGN IN" button
    And I wait for ajax to complete

  @feat
  Scenario: User attempts to Register - form is available
    When I am online at "https://customerapp-neon.vercel.app/"
    And I click on the "ACCOUNT" button
    And I wait for ajax to complete
    And I click on the "SIGN IN" button
    And I wait for ajax to complete
    Then I tab to the "REGISTER" tab
    And I wait for ajax to complete
    Then I should see the "Full Name *" field
    And I should see the "Email *" field
    And I should see the "Phone (optional)" field
    And I should see the "Password *" field
    And I should see the "CREATE ACCOUNT" message

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
    Then I should see the "SIGN OUT" message

  Scenario: User attempts to login - form is available
    Then I should see the "Email" field
    And I should see the "Password" field
    And I should see the "SIGN IN" message

  Scenario: User attempts to login with valid credentials
    Then I enter "demo@hearth.app" into the "Email" field
    And I wait for ajax to complete
    And I enter "hearth123" into the "Password" field
    And I wait for ajax to complete
    And I click on the "SIGN IN" button
    And I wait for ajax to complete
    Then I should see the "SIGN OUT" message

  @feat
  Scenario Outline: User attempts to login with invalid credentials - <CheckPointType>
    And I enter "<Email>" into the "Email" field
    And I enter "<Password>" into the "Password" field
    And I click on the "SIGN IN" button
    And I wait for ajax to complete
    Then I should see the "<CheckPointValue>" message

  Examples:
      | Email            | Password   | CheckPointType    | CheckPointValue  |
      | demo@hearth.app  | hearth123  | Invalid Email     | Invalid Email    |
      | demo@hearth.app  | hearth123  | Invalid Password  | Invalid Password |

