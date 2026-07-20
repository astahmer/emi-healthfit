Feature: Send message
  Scenario: Send the first message from a new chat
    Given a user is on a new chat page that creates conversations
    When they send the message "First hello"
    Then the assistant reply "Hello back" should be displayed
