Feature: Delete conversations
  Scenario: Delete the active conversation opened directly
    Given a user is on session one
    When they delete the active session from the sidebar
    Then the URL should be the new chat page
    And the new chat suggestion "Summarize my last workout." should be visible
    And session one should not be listed in the sidebar

  Scenario: Delete the active conversation after entering it from the new-chat route
    Given a user is on a new chat page with session one listed
    When they open session one from the sidebar
    And they delete the active session from the sidebar
    Then the URL should be the new chat page
    And the new chat suggestion "Summarize my last workout." should be visible
    And the message "one message answer" should not be displayed

  Scenario: Reset to a new chat before the delete request finishes
    Given a user is on session one whose delete request is held
    When they delete the active session from the sidebar
    Then the URL should be the new chat page
    And the new chat suggestion "Summarize my last workout." should be visible
    When the delete request finishes
    Then session one should not be listed in the sidebar

  Scenario: Cancel the delete confirmation
    Given a user is on session one
    When they cancel deleting the active session
    Then the URL should include "/chat/one"
    And the message "one message answer" should be displayed

  Scenario: Deleting another session keeps the active conversation
    Given a user is on session one
    When they delete session two from the sidebar
    Then the URL should include "/chat/one"
    And the message "one message answer" should be displayed
    And session two should not be listed in the sidebar

  Scenario: Stale message loads do not resurrect a deleted conversation
    Given a user is on session one whose message loads are held
    When they delete the active session from the sidebar
    And the message loads finish
    Then the URL should be the new chat page
    And the new chat suggestion "Summarize my last workout." should be visible
    And the message "one message answer" should not be displayed
