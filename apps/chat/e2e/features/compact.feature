Feature: Compact conversation
  Scenario: Compact into a fresh session
    Given a user is on session one
    When they compact the conversation
    Then they should land on the compacted session
    And the compacted context should show "Prior workout notes."

  Scenario: Show a failure toast when compacting fails
    Given a user is on session one whose compaction fails
    When they compact the conversation
    Then the message "Could not compact conversation." should be displayed

  Scenario: Show a failure toast when copying the conversation fails
    Given a user is on session one without clipboard permission
    When they copy the conversation as markdown
    Then the message "Could not copy conversation." should be displayed
