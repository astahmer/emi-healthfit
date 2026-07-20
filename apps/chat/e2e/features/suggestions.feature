Feature: Chat suggestions
  Scenario: Click a follow-up suggestion
    Given a user is on the chat page with suggestions
    When they click the suggestion "Tell me about recovery"
    Then the assistant reply "Recovery looks good" should be displayed
