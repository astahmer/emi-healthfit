Feature: Send message
  Scenario: Send the first message from a new chat
    Given a user is on a new chat page that creates conversations
    When they send the message "First hello"
    Then the assistant reply "Hello back" should be displayed

  Scenario: Send another message after an assistant reply
    Given a user is on session one that replies "Sleep more tonight" to the next message
    When they send the message "What about sleep?"
    Then the message "one message answer" should be displayed
    And the assistant reply "Sleep more tonight" should be displayed
