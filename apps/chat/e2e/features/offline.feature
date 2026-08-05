Feature: Offline resilience
  Scenario: Show cached sidebar and messages when the API is unreachable
    Given a user is on session one with cached history
    When they reload the page with the API unreachable
    Then the message "one message answer" should be displayed
    And the link "Session One" should be visible
