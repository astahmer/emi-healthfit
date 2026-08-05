Feature: Advanced attachments
  Scenario Outline: Send multiple attachments in one batch
    Given a user is on session one with chat persistence
    When they attach <count> images
    Then <count> attachment previews should be visible
    When they send the message "Look at these"
    Then the assistant reply "Saw the image" should be displayed
    And the last request should contain <count> file parts

    Examples:
      | count |
      | 2     |
      | 3     |

  Scenario: Attach images in two batches
    Given a user is on session one with chat persistence
    When they attach 2 images
    And they attach 1 more image
    Then 3 attachment previews should be visible
    When they send the message "Two batches"
    Then the last request should contain 3 file parts

  Scenario: Remove one attachment and keep the others
    Given a user is on session one with chat persistence
    When they attach 3 images
    And they remove the attachment "progress-2.png"
    Then 2 attachment previews should be visible
    When they send the message "Keep two"
    Then the last request should contain 2 file parts

  Scenario: Paste an image from the clipboard
    Given a user is on session one with chat persistence
    When they paste the image "pasted.png"
    Then the attachment preview "pasted.png" should be visible

  Scenario: Attachment error clears after adding a valid file
    Given a user is on session one
    When they attach the image "bad.bmp"
    Then the unsupported image notice should be visible
    When they attach the image "progress.png"
    Then the attachment preview "progress.png" should be visible
    And the unsupported image notice should not be visible

  Scenario: Queue a follow-up with an attachment
    Given a user is on session one with a held generation
    When they send the message "First question"
    And they attach the image "queue.png" while streaming
    And they queue the attachment before the reply finishes
    Then the queued follow-ups should contain "1 attachment"
    When they force-send queued message 1
    Then the forced turn should appear with its attachment
