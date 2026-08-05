Feature: Temporary chat
  Scenario: Temporary reply disappears after refresh
    Given a user starts a temporary chat
    When they send the message "Ghost note"
    Then the assistant reply "Ghost reply" should be displayed
    When they refresh the new chat page
    Then the message "Ghost reply" should not be displayed

  Scenario: Temporary chat does not create a conversation
    Given a user starts a temporary chat
    When they send the message "Ghost note"
    Then the assistant reply "Ghost reply" should be displayed
    And the last request should be temporary
    And no conversation should have been created

  Scenario: Temporary chat streams without fetching persisted messages
    Given a user starts a temporary chat that replies "Ephemeral reply"
    When they send the message "Ephemeral note"
    Then the assistant reply "Ephemeral reply" should be displayed
    And the last request should be temporary
    And no temporary conversation messages should have been fetched

  Scenario: Keep a temporary chat as a normal conversation
    Given a user starts a temporary chat that keeps conversations
    When they send the message "Ghost note"
    And they keep the temporary chat
    Then the URL should include "/chat/kept-ghost"
    And the message "Temporary chat kept." should be displayed
    And the message "Ghost note" should be displayed
