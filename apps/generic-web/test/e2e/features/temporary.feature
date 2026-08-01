Feature: Generic settings

  Scenario: Switch theme and temporary chat mode
    Given a new visitor opens generic chat
    When they select the dark generic theme
    Then the generic chat should use the dark theme
    When they enable temporary generic chat
    Then the temporary indicator should be visible
