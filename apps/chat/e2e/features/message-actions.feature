Feature: Message actions
  Scenario: Copy an assistant message
    Given a user is on session one
    When they copy the assistant message
    Then they should see the status "Message copied."
