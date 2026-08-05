Feature: Discord integration
  Scenario: Generate and revoke a Discord link code from settings
    Given a user is on the settings page
    When they generate a Discord link code
    Then the link code "ABCD0001" should be visible
    When they revoke the Discord link code
    Then the revoke button should not be visible

  Scenario: Unlink a Discord account from settings
    Given a user is on the settings page with a linked Discord account "discord-user-42"
    When they unlink the Discord account after confirmation
    Then the linked Discord account "discord-user-42" should not be visible
