Feature: Failed-turn recovery
  Scenario: Retry a coach reply left incomplete by an older failed turn
    Given a user is on session one with an incomplete coach reply
    Then the coach failure notice should be visible
    When they retry the coach response
    Then the assistant reply "Recovered coach reply" should be displayed
    And the retried request should replace the previous user message

  Scenario: Retry a request that failed before any response
    Given a user is on session one whose replies fail with status 500
    When they send the message "Please fail"
    Then the "Retry this request" button should be visible
    And the message "Your previous request did not receive a response." should be displayed

  Scenario: Send a new request after a persisted orphaned turn
    Given a user is on session one with a persisted orphaned turn
    When they send the message "Continue with a new request"
    Then the assistant reply "Continued response" should be displayed
    And the request should not carry a replacement message

  Scenario: Resume an unfinished generation after refresh
    Given a user is on session one with a resumable generation
    Then the resumed answer "Resumed answer" should be displayed

  Scenario: Surface a generation conflict from another tab
    Given a user is on session one whose replies conflict
    When they send the message "Overlapping send"
    Then the generation conflict notice should be visible
