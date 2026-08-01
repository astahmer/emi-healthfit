Feature: Generic memories

  Scenario: Save and remove a memory
    Given a new visitor opens generic chat
    When they open the generic memories panel
    And they save the memory "Prefers Gherkin coverage"
    Then the memory "Prefers Gherkin coverage" should be visible
    When they delete the visible memory
    Then the memory "Prefers Gherkin coverage" should not be visible
