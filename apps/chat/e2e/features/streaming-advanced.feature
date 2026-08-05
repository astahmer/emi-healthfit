Feature: Advanced streaming behavior
  Scenario: Stop a mid-stream generation and retry the coach reply
    Given a user is on session one with a held generation
    When they send the message "Please stop me"
    And they stop the generation
    And the held chat is released
    Then the coach failure notice should be visible
    When they retry the coach response
    Then the assistant reply "Follow-up answer" should be displayed

  Scenario: Shift+Enter sends now while streaming
    Given a user is on session one with a held generation
    When they send the message "First question"
    And they type "Interrupt now" and press Shift+Enter
    Then the message "Interrupt now" should be displayed

  Scenario: A failed request can be retried successfully
    Given a user is on session one whose replies fail with status 500
    When they send the message "Please fail"
    Then the "Retry this request" button should be visible
    When the next reply will be "Recovered answer"
    And they retry the failed request
    Then the assistant reply "Recovered answer" should be displayed
