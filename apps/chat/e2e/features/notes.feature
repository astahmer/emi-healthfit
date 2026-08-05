Feature: Notes
  Scenario: Create, edit, search, and delete notes
    Given a user has an existing note "Keep one full rest day"
    When they add the note "Track sleep before hard sessions"
    And they edit the note "Track sleep before hard sessions" to "Track sleep before long runs"
    And they search notes for "rest"
    Then the note "Keep one full rest day" should be visible
    And the note "Track sleep before long runs" should not be visible
    When they clear the notes search
    And they delete the note "Track sleep before long runs"
    Then the note "Track sleep before long runs" should not be visible

  Scenario: Notes page scrolls to the bottom when content overflows
    Given a user has many notes
    Then the notes page should scroll to the last note
