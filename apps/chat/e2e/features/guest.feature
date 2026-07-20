Feature: Guest access
  Scenario: Continue as guest into chat
    Given a signed-out user is on the auth page
    When they continue as guest
    Then the chat composer should be visible
