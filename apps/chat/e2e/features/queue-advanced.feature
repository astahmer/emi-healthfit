Feature: Advanced follow-up queue
  Scenario Outline: Queue <count> follow-ups, edit one, and force-send another
    Given a user is on session one with a held generation that replies <count> times
    When they queue <count> follow-ups
    And they edit queued message <edit> to "Edited item"
    And they force-send queued message <force>
    Then the queued replies should be displayed
    And the message "Edited item" should be displayed

    Examples:
      | count | edit | force |
      | 2     | 1    | 1     |
      | 4     | 2    | 3     |
      | 5     | 3    | 4     |

  Scenario: Queued follow-ups survive a refresh
    Given a user is on session one with a held generation
    When they queue "Survivor one" and "Survivor two" before the reply finishes
    And they refresh the conversation
    Then the queued follow-ups should contain "Survivor one" and "Survivor two"

  Scenario: Queue clears when switching sessions
    Given a user is on session one with a held generation
    When they queue "Leaving behind" before the reply finishes
    And they open session two from the sidebar
    Then the queued follow-ups should be empty

  Scenario: Cancel all queued follow-ups
    Given a user is on session one with a held generation
    When they queue 3 follow-ups
    And they cancel all queued follow-ups
    Then the queued follow-ups should be empty

  Scenario: Escape cancels editing a queued follow-up
    Given a user is on session one with a held generation
    When they queue 2 follow-ups
    And they press ArrowUp to edit the last queued message
    And they press Escape to cancel the edit
    Then the queued follow-ups should not be in editing mode

  Scenario: Queued follow-ups drain automatically after the stream finishes
    Given a user is on session one with a held generation that replies 2 times
    When they queue 2 follow-ups
    And the held chat is released
    Then the message "First question" should be displayed
    And the message "Queue item 2" should be displayed
    And the message "Reply 2" should be displayed

  Scenario: Stop the stream and let the queued follow-up drain
    Given a user is on session one with a held generation
    When they queue "After stop" before the reply finishes
    And they stop the generation
    And the held chat is released
    Then the message "After stop" should be displayed
    And the assistant reply "Follow-up answer" should be displayed
