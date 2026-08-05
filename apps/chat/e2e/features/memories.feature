Feature: Memories
  Scenario: Create, filter, and delete manually saved memories
    Given a user has a memory "Enjoys early training"
    When they save the memory "Prefers Wednesday rest days"
    And they search memories for "Wednesday"
    Then the memory "Prefers Wednesday rest days" should be visible
    And the memory "Enjoys early training" should not be visible
    When they delete the memory "Prefers Wednesday rest days"
    Then the memory "Prefers Wednesday rest days" should not be visible

  Scenario: Show and edit the merged memory summary alongside source memories
    Given a user has a memory "Prefers Wednesday rest days" with a summary
    When they edit the merged memory summary
    Then the memory summary should be saved
    And the memory "Prefers Wednesday rest days" should be visible

  Scenario: Save and remove an assistant message memory
    Given a user is on session one
    When they save the assistant message to memory
    Then the message "Saved 1 memory." should be displayed
    When they remove the assistant message memories
    Then the message "Removed message memories." should be displayed

  Scenario: Memory page scrolls to the bottom when content overflows
    Given a user has many memories
    Then the memory page should scroll to the last memory
