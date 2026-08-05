Feature: Advanced message rendering
  Scenario: Reasoning section stays collapsed until opened
    Given a user is on session one with reasoning and a message reference
    Then the message "Thinking about recovery metrics." should be hidden
    When they open the reasoning section
    Then the message "Thinking about recovery metrics." should be displayed

  Scenario: Tool input JSON is folded until expanded
    Given a user is on session one with rich component tool results
    Then the tool input of "get summary" should not be visible
    When they expand the input of "get summary"
    Then the tool input of "get summary" should be visible

  Scenario: Copying a message without clipboard permission shows an error
    Given a user is on session one without clipboard permission
    When they copy the assistant message without clipboard permission
    Then the message "Could not copy message." should be displayed

  Scenario Outline: Render long and repeated content
    Given a user is on session one that replies "<reply>" to the next message
    When they send the message "<message>"
    Then the message "<message>" should be displayed

    Examples:
      | message                                         | reply                              |
      | A very long message that keeps going and going  | Short reply                        |
      | Repeated word repeated word repeated word       | Another reply                      |
      | 1234567890-abcdefghij                           | A reply with numbers 12345         |
