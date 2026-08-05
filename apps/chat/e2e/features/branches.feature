Feature: Conversation branches
  Scenario: Fork a branch from an assistant message
    Given a user is on session one
    When they fork from the assistant message
    Then the branch "Branch" should be visible

  Scenario: Fork failure does not create a branch
    Given a user is on session one whose fork fails
    When they fork from the assistant message
    Then the branch "Branch" should not be visible
    And the message "Creating branch…" should be displayed

  Scenario: Discard and restore a branch from thread navigation
    Given a user is on session one with branch "Branch"
    When they discard the branch "Branch"
    Then the branch "Branch" should not be visible
    When they restore the discarded branch
    Then the branch "Branch" should be visible

  Scenario: Rename, pin, and focus branches
    Given a user is on session one with branches "Branch A" and "Branch B"
    When they focus the branch "Branch B"
    And they rename the branch "Branch A" to "Renamed Branch"
    And they pin the branch "Renamed Branch"
    Then the branch "Renamed Branch" should be pinned

  Scenario: Search within a conversation that has branches
    Given a user is on session one with branch "Branch"
    When they search this conversation for "one message"
    Then the message "one message" should be displayed
