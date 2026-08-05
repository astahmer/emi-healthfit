Feature: Session search, sync, and diagnostics
  Scenario: Search sessions and sync the list
    Given a user is on session one with searchable sessions
    When they search sessions for "Two"
    Then the link "Session Two" should be visible
    And the link "Session One" should not be visible
    When they clear the session search
    And they sync sessions from the sidebar
    Then the link "Session One" should be visible
    And the session list should have been synced

  Scenario: Export session diagnostics from the sidebar
    Given a user is on session one
    When they export diagnostics from the sidebar
    Then a diagnostics download should start
