Feature: Attachments
  Scenario: Preview and send an attachment
    Given a user is on session one with chat persistence
    When they attach the image "progress.png"
    Then the attachment preview "progress.png" should be visible
    When they send the message "Look at this"
    Then the assistant reply "Saw the image" should be displayed

  Scenario: Remove an attachment before sending
    Given a user is on session one
    When they attach the image "progress.png"
    And they remove the attachment "progress.png"
    Then the attachment preview "progress.png" should not be visible

  Scenario: Reject unsupported image types
    Given a user is on session one
    When they attach the image "bad.bmp"
    Then the unsupported image notice should be visible

  Scenario: Send the attachment with the chat request
    Given a user is on session one with chat persistence
    When they attach the image "progress.png"
    And they send the message "Look at this"
    Then the assistant reply "Saw the image" should be displayed
    And the last request should contain a file part named "progress.png"

  Scenario: Send a realistic photo with the chat request
    Given a user is on session one with chat persistence
    When they attach the photo "label-photo.png"
    And they send the message "Look at this"
    Then the assistant reply "Saw the image" should be displayed
    And the last request should contain a real image data URL for "label-photo.png"

  Scenario: Convert an iPhone HEIC photo before sending
    Given a user is on session one with chat persistence
    When they attach the photo "iphone-photo.heic"
    Then the attachment preview "iphone-photo.jpg" should be visible
    When they send the message "Look at this"
    Then the assistant reply "Saw the image" should be displayed
    And the last request should contain a real image data URL for "iphone-photo.jpg"
