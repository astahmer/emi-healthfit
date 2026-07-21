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

  Scenario: Queue a follow-up while the assistant is still streaming
    Given a user is on session one with a held generation
    When they send "First question" and queue "Second question" before the reply finishes
    Then the live assistant answer and both user turns should remain visible
