Feature: Hevy integration
  Scenario: Connect Hevy from settings and show synced workouts
    Given a user is on the settings page
    When they connect Hevy with the API key "hevy-e2e-key"
    Then the Hevy connected status should be visible
    When they open the workouts page
    Then the workout "E2E Push Day" should be visible
    And the exercise "Bench press" should be visible after expanding the workout

  Scenario: Sync Hevy from settings and show stale or error status
    Given a user is on the settings page with a stale Hevy connection
    When they sync Hevy
    Then the Hevy up-to-date status should be visible

  Scenario: Disconnect Hevy after confirmation and keep workouts available
    Given a user is on the settings page with a connected Hevy account
    When they disconnect Hevy after confirmation
    Then the Hevy disconnect notice should be visible
    When they open the workouts page
    Then the workout "E2E Push Day" should be visible

  Scenario: Cancel Hevy disconnect when confirmation is dismissed
    Given a user is on the settings page with a connected Hevy account
    When they dismiss the Hevy disconnect confirmation
    Then the Hevy sync button should be visible

  Scenario: Remove Hevy cached data after confirmation
    Given a user is on the settings page with a connected Hevy account
    When they remove Hevy cached data after confirmation
    Then the Hevy data removed notice should be visible
    When they open the workouts page
    Then the no workouts notice should be visible
