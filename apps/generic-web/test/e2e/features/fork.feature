Feature: Generic conversation branches

  Scenario: Open a branch from a generic assistant message
    Given a configured visitor opens generic chat
    When they send the generic message "Branch this generic chat"
    And they open the generic branch
    Then the generic branch heading should be visible
