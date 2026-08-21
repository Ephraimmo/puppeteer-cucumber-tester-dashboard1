Feature: Testing The Report Meun
    Feature Description

    Background: Login web Page
        Given I am online at "C:/Users/karabomo/Desktop/KasiMonateAdnim/index.html"
        Then I login in on the website with email value "projectemail089@gmail.com" and password value is "Ephraim@217377781"
        Then I wait for the page to load
    
    Scenario: report test
        Then I click side meun item with text "Sign Out"
        Then I wait for 5 seconds
      