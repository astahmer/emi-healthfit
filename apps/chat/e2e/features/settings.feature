Feature: Settings
  Scenario: Show the app version and run an update check
    Given a user is on the settings page
    Then the app version label should be visible
    When they check for updates
    Then the app update status should be visible

  Scenario: Require an OpenAI API key before showing the chat composer
    Given a user without an API key is on the chat page
    Then the API key form should be visible
    And the message input should not be visible
    When they save the API key "sk-test"
    Then the chat composer should be visible
