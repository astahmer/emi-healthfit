Feature: Generic memory summary
  Scenario: Edit the memory summary
    Given a guest user is on the generic chat
    When they open the Memories panel
    Then the memory summary should be "The user prefers concise worker answers."
    When they replace the memory summary with "The user prefers edited worker answers."
    Then the memory summary should be "The user prefers edited worker answers."
