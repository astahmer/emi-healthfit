Feature: Message actions
  Scenario: Copy an assistant message
    Given a user is on session one
    When they copy the assistant message
    Then they should see the status "Message copied."

  Scenario: Copy and export an assistant message
    Given a user is on session one
    When they copy the assistant message
    Then the clipboard should contain "one message answer"
    When they export the assistant message as markdown
    Then a message markdown download should start

  Scenario: Edit a user message and regenerate an assistant reply
    Given a user is on session one that replies "Edited answer" to the next message
    When they edit the message "one message" to "Edited question"
    Then the assistant reply "Edited answer" should be displayed
    When the next reply will be "Regenerated answer"
    And they regenerate the last assistant response
    Then the assistant reply "Regenerated answer" should be displayed

  Scenario: Regenerate from the last user message action
    Given a user is on session one that replies "Regenerated from user" to the next message
    When they regenerate from the user message "one message"
    Then the assistant reply "Regenerated from user" should be displayed
    And the retried request should replace the previous user message
