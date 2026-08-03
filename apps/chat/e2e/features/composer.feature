Feature: Composer controls
  Scenario: Enable coach mode
    Given a user is on a new chat page
    When they click the Coach button
    Then the URL should include "coach="

  Scenario: Enable temporary mode
    Given a user is on a new chat page
    When they click the Temporary button
    Then the Temporary button should look active

  Scenario: Select a different model
    Given a user is on a new chat page
    When they select the model "GPT-5.6 Sol"
    Then the model combobox should show "GPT-5.6 Sol"
