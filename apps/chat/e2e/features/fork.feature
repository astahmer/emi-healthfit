Feature: Fork branch
  Scenario: Fork from an assistant message
    Given a user is on session one
    When they fork from the assistant message
    Then the branch "Branch" should be visible
