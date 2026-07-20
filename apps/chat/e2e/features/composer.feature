Feature: Composer controls
  Scenario: Enable coach mode
    Given a user is on a new chat page
    When they click the Coach button
    Then the URL should include "coach="
