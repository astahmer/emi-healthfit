Feature: Advanced composer behavior
  Scenario: Desktop Enter sends the message
    Given a user is on session one with chat persistence
    When they type "Enter to send" and press Enter
    Then the assistant reply "Saw the image" should be displayed

  Scenario: Shift+Enter adds a newline on desktop
    Given a user is on session one
    When they type "Line one" and press Shift+Enter
    Then the message input should contain a trailing newline

  Scenario: Draft survives a refresh
    Given a user is on session one
    When they type the draft "Saved draft text"
    And they refresh the conversation
    Then the message input should contain "Saved draft text"

  Scenario: Draft is shared across sessions
    Given a user is on session one
    When they type the draft "Session one draft"
    And they open session two from the sidebar
    Then the message input should contain "Session one draft"

  Scenario: Offline send keeps the draft and recovers online
    Given a user is on session one
    When they go offline and type "Offline draft"
    And they send the message "Offline draft"
    Then the message "You are offline. Your draft is saved locally until you reconnect." should be displayed
    When they come back online
    And they send the message "Offline draft"
    Then the message "Offline draft" should be displayed

  Scenario: Whitespace-only message is blocked
    Given a user is on session one with chat persistence
    When they send the message "   "
    Then no chat request should have been made

  Scenario Outline: Render special message content
    Given a user is on session one that replies "Got it" to the next message
    When they send the message "<message>"
    Then the message "<message>" should be displayed
    And the last request should contain the text "<message>"

    Examples:
      | message                                   |
      | Hello, world!                             |
      | It's «quoted» — and dashed                |
      | 🔥🏋️ emoji workout                        |
      | Hash #tag and @mention                    |
      | Question with ? and exclamation!          |
