Feature: Archived sessions
  Scenario: Restore an archived session
    Given a user has an archived session one
    When they restore the session from the sidebar
    Then the session should no longer be archived
