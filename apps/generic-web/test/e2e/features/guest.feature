Feature: Guest access

  Scenario: Anonymous visitor reaches the generic chat
    Given a new visitor opens generic chat
    Then the generic chat composer should be visible
    And no authentication error should be visible
