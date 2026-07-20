Feature: Temporary chat
  Scenario: Temporary reply disappears after refresh
    Given a user starts a temporary chat
    When they send the message "Ghost note"
    Then the assistant reply "Ghost reply" should be displayed
    When they refresh the new chat page
    Then the message "Ghost reply" should not be displayed
