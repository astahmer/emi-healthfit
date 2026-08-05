Feature: Authentication
  Scenario: Show Google denial and guest start failure
    Given a signed-out user with guest sign-in failing
    When they open the auth page with an access denied error
    Then the Google denial notice should be visible
    When they continue as guest
    Then the guest start failure notice should be visible

  Scenario: Continue with Google into chat when social sign-in succeeds
    Given a signed-out user with social sign-in available
    When they continue with Google
    Then the URL should include "/chat"
    And the chat composer should be visible
