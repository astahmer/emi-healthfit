Feature: Real Worker chat
  Scenario: Send a message through the real Worker and persist it
    Given a real worker guest is on the chat page
    When they send the message "Hello real worker" through the real worker
    Then the assistant reply "Real worker reply" should be displayed
    And the real worker conversation should be listed in the sidebar

  Scenario: Reload the chat and keep the persisted conversation
    Given a real worker guest is on the chat page with a conversation
    When they reload the chat page
    Then the message "Hello real worker" should be displayed
    And the assistant reply "Real worker reply" should be displayed

  Scenario: The real Worker executes tools against the real database
    Given a real worker guest is on the chat page
    When they send the message "Show my streak" through the real worker
    Then the tool "get workout streak" should be displayed
    And the assistant reply "Real worker reply" should be displayed

  Scenario: Delete the conversation through the real API
    Given a real worker guest is on the chat page with a conversation
    When they delete the active session from the sidebar
    Then the URL should be the new chat page
    And the real worker conversation should not be listed in the sidebar

  Scenario: Send a realistic photo through the real Worker
    Given a real worker guest is on the chat page
    When they attach the photo "label-photo.png" through the real worker
    And they send the message "What is in this photo?" through the real worker
    Then the assistant reply "Real worker reply" should be displayed

  Scenario: Notes persist through the real API
    Given a real worker guest is on the notes page
    When they add the note "Real worker note"
    And they reload the notes page
    Then the note "Real worker note" should be visible
    When they delete the note "Real worker note"
    Then the note "Real worker note" should not be visible
