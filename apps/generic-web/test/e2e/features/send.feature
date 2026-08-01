Feature: Generic sending

  Scenario: Send a generic message and receive a persisted reply
    Given a configured visitor opens generic chat
    When they send the generic message "Hello from Gherkin"
    Then the generic assistant reply should be visible
    And the generic conversation should be visible in the sidebar
