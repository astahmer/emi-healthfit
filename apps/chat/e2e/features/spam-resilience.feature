Feature: Spam-click and provider-error resilience
  Scenario: A mid-stream provider error shows its real message
    Given a user is on session one whose provider replies with the stream error "Model overloaded, retry later."
    When they send the message "Please fail"
    Then the message "Model overloaded, retry later." should be displayed
    And the "Retry this request" button should be visible

  Scenario: An unreadable provider error never reaches the user as [object Object]
    Given a user is on session one whose provider replies with the stream error "[object Object]"
    When they send the message "Please fail"
    Then the message "Chat response stream failed." should be displayed
    And the message "[object Object]" should not be displayed

  Scenario: Double-clicking send does not stop the stream
    Given a user is on session one whose replies start slowly
    When they spam-click the send button
    Then the assistant reply "Slow answer" should be displayed
    And only 1 chat request should have been sent

  Scenario: Spamming retry only fires one retry
    Given a user is on session one with a delayed stream error "Model overloaded, retry later."
    When they send the message "Please fail"
    Then the "Retry this request" button should be visible
    When they spam the retry button
    Then the assistant reply "Mock answer" should be displayed
    And only 2 chat requests should have been sent
