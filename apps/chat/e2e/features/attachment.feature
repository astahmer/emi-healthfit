Feature: Attachments
  Scenario: Preview and send an attachment
    Given a user is on session one with chat persistence
    When they attach the image "progress.png"
    Then the attachment preview "progress.png" should be visible
    When they send the message "Look at this"
    Then the assistant reply "Saw the image" should be displayed
