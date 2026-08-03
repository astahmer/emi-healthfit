Feature: Generic WebMCP
  Scenario: Fill the composer without exposing credentials
    Given a guest user is on the generic chat with WebMCP enabled
    When they configure the API key "sk-never-expose"
    Then the WebMCP tool "get_chat_context" should be registered
    And the WebMCP context should not expose the configured API key
    When an agent fills the composer with "drafted by BDD" through WebMCP
    Then the message composer should contain "drafted by BDD"
