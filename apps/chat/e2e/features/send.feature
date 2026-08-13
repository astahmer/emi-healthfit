Feature: Send message
  Scenario: Send the first message from a new chat
    Given a user is on a new chat page that creates conversations
    When they send the message "First hello"
    Then the assistant reply "Hello back" should be displayed

  Scenario: Lock the send button while the first send is still starting
    Given a user is on a new chat page that creates conversations slowly
    When they send the message "Hello twice"
    Then the send button should be locked until the reply streams
    And only one chat request should have been made

  Scenario: Send another message after an assistant reply
    Given a user is on session one that replies "Sleep more tonight" to the next message
    When they send the message "What about sleep?"
    Then the message "one message answer" should be displayed
    And the assistant reply "Sleep more tonight" should be displayed

  Scenario: Queue a follow-up while the assistant is still streaming
    Given a user is on session one with a held generation
    When they send "First question" and queue "Second question" before the reply finishes
    Then the live assistant answer and both user turns should remain visible

  Scenario: Edit cancel and force-send queued follow-ups
    Given a user is on session one with a held generation
    When they queue multiple follow-ups, edit with arrow keys, cancel one, and force-send another
    Then the forced and remaining queued turns should appear without wiping prior history

  Scenario: Share queued follow-ups across browser tabs
    Given a user has a held generation with queued follow-ups in one tab
    When they open the same session in another tab
    Then they can see edit and cancel the shared queue

  Scenario: Send another typed message and keep the previous assistant answer
    Given a user is on session one that replies "Sleep more tonight" to the next message
    When they send the message "What about sleep?"
    Then the message "one message answer" should be displayed
    And the assistant reply "Sleep more tonight" should be displayed

  Scenario: Send the first message in an existing conversation with empty history
    Given a user is on an empty conversation that replies "Chat started"
    When they send the message "Start this chat"
    Then the assistant reply "Chat started" should be displayed

  Scenario: Block an empty send
    Given a user is on session one with chat persistence
    When they click the send button without a message
    Then no chat request should have been made

  Scenario: Allow a file-only send
    Given a user is on session one whose replies accept files
    When they attach the image "solo.png"
    And they send the message ""
    Then the assistant reply "Got the file" should be displayed
    And the last request should contain a file part without a text part

  Scenario: Keep Enter as a new line on mobile
    Given a user is on a new chat page on a mobile viewport
    When they type "First line" and press Enter
    Then the message input should keep Enter as a new line
    And no chat request should have been made

  Scenario: Switch sessions, render tools, and start a new chat
    Given a user is on session one
    When they open session two from the sidebar
    Then the message "two message answer" should be displayed
    When they start a new chat from the header
    Then the URL should be the new chat page

  Scenario: Show the persisted completion after a stream ends without finish
    Given a user is on session one whose stream ends without a finish event
    When they send the message "Complete despite truncation"
    Then the assistant reply "Persisted completion" should be displayed
