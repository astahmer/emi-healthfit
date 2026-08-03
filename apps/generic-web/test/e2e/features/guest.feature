Feature: Generic guest chat
  Scenario: Send a message as a guest
    Given a guest user is on the generic chat
    When they send "Hello generic" in the generic chat
    Then the message "Hello generic" should be visible
    And the generic assistant reply "Generic worker reply" should be visible
    And the generic chat API should have received one request
