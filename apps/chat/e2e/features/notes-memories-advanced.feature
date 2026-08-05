Feature: Advanced notes and memories
  Scenario: Search notes with no results shows the empty state
    Given a user has an existing note "Keep one full rest day"
    When they search notes for "zzz-nonexistent"
    Then the note "Keep one full rest day" should not be visible

  Scenario: Delete all notes shows the empty state
    Given a user has an existing note "Only note"
    When they delete the note "Only note"
    Then the note "Only note" should not be visible
    And the message "No notes yet." should be displayed

  Scenario: A long memory renders without truncation
    Given a user has a memory "This memory contains a very long sentence that keeps going with many words to confirm the memory list renders full content without clipping or truncating the text."
    Then the memory "This memory contains a very long sentence that keeps going with many words to confirm the memory list renders full content without clipping or truncating the text." should be visible

  Scenario: Save an assistant message memory and remove it from the memory page
    Given a user is on session one
    When they save the assistant message to memory
    Then the message "Saved 1 memory." should be displayed
    When they open the memory page
    Then the memory "one message answer" should be visible
    When they delete the memory "one message answer"
    Then the memory "one message answer" should not be visible
