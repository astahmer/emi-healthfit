Feature: Advanced session management
  Scenario: Rename with an empty title is blocked
    Given a user is on session one
    When they try to rename session one to an empty title from the sidebar
    Then the session rename input should be visible

  Scenario: Archive, restore, and delete cycle
    Given a user is on session one
    When they archive session one from the sidebar
    Then the session should be archived
    When they restore the session from the sidebar
    Then the session should no longer be archived
    When they delete session one from the sidebar
    Then session one should not be listed in the sidebar

  Scenario: Clone creates a copy and navigates to it
    Given a user is on session one
    When they clone session one from the sidebar
    Then the URL should include "/chat/cloned-one"
    And the message "cloned-one message" should be displayed

  Scenario: Search with no results shows the empty sidebar state
    Given a user is on session one with searchable sessions
    When they search sessions for "zzz-nonexistent"
    Then the link "Session One" should not be visible
    And the message "No sessions yet." should be displayed

  Scenario: Pin then unpin keeps the conversation listed
    Given a user is on session one
    When they pin session one from the sidebar
    And they unpin session one from the sidebar
    Then session one should not be pinned
    And the link "Session One" should be visible
