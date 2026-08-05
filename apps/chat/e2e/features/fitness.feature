Feature: Fitness data screens
  Scenario: Show the summary overview metrics from analytics
    Given a user is on the summary page with analytics
    Then the health overview heading should be visible
    And the metric "Average steps" should be visible
    And the exercise "Bench press" should be visible

  Scenario: Upload health and Hevy files through the upload panel
    Given a user is on the upload page
    When they upload "health.json" and "hevy.csv"
    Then the upload success notice should be visible

  Scenario: List workout sessions from mock Hevy data
    Given a user with a connected Hevy account is on the workouts page
    Then the workout "E2E Push Day" should be visible
    And the exercise "Bench press" should be visible after expanding the workout
