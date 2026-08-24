Feature: Follow-up queue
  Scenario: Stop a mid-stream generation
    Given a user is on session one with a held generation
    When they send the message "Please stop me"
    And they stop the generation
    Then the message "Should not appear" should not be displayed
    And the send message button should be visible

  Scenario: Queue a follow-up while streaming and keep the live answer
    Given a user is on session one with a held generation
    When they send "First question" and queue "Second question" before the reply finishes
    Then the live assistant answer and both user turns should remain visible

  Scenario: Edit queued follow-ups with arrow keys and cancel one before drain
    Given a user is on session one with a held generation
    When they queue multiple follow-ups, edit with arrow keys, cancel one, and force-send another
    Then the forced and remaining queued turns should appear without wiping prior history

  Scenario: Force-send a queued follow-up and interrupt the live generation
    Given a user is on session one with a held generation
    When they force-send a queued follow-up before the reply finishes
    Then the forced turn should appear without the interrupted reply

  Scenario: Share queued follow-ups across tabs for view, edit, and cancel
    Given a user has a held generation with queued follow-ups in one tab
    When they open the same session in another tab
    Then they can see edit and cancel the shared queue

  Scenario: Relay a force-send from a second tab to the streaming tab
    Given a user has a held generation with queued follow-ups in one tab
    When they open the same session in another tab
    And they force-send the queued message from the second tab
    Then the forced turn should appear in the first tab without the interrupted reply

  Scenario: Keep the composer draft while a response is streaming
    Given a user is on session one with a held generation
    When they type "Typed while streaming" while the reply is held
    Then the draft "Typed while streaming" should be preserved after the reply finishes

  Scenario: Send now delivers a queued follow-up left behind by a failed generation
    Given a user is on session one whose first reply fails after 1500 ms with "Model overloaded"
    When they send "First question" and queue "Stuck question" before the failure
    Then the queued panel should still show "Stuck question" once the failure surfaces
    When they force-send queued message 1
    Then the assistant reply "Mock answer" should be displayed
    And the queued panel should disappear
