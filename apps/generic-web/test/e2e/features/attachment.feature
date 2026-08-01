Feature: Generic attachments

  Scenario: Preview and send a supported attachment
    Given a configured visitor opens generic chat
    When they attach the text file "notes.txt"
    Then the attachment preview "notes.txt" should be visible
    When they send the attachment
    Then the request should contain attachment "notes.txt"

  Scenario: Reject an unsupported image format
    Given a new visitor opens generic chat
    When they attach the unsupported image "notes.bmp"
    Then the attachment validation error should be visible
