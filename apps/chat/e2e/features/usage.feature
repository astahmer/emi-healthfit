Feature: Conversation usage

  Scenario: Uses the default token budget from settings
    Given a user is on the settings page
    When they set the default token budget to 250000
    When they navigate to session one
    Then the conversation token budget should be 250000

  Scenario: Shows when a conversation exceeds its token budget
    Given a user is on session one with a token budget of 20
    Then the conversation usage should show it is over budget

  Scenario: Auto-compacts in place when a send exceeds the token budget
    Given a user is on session one with a token budget of 10 and persisted replies
    When they send the message "What should I do next?"
    Then the compacted summary block should be visible
    And the message "one message" should not be visible
    And the compacted summary block should be collapsible
