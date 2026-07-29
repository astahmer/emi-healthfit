Feature: Compact conversation
  Scenario: Compact into a fresh session
    Given a user is on session one
    When they compact the conversation
    Then they should land on the compacted session
    And the compacted context should show "Prior workout notes."
