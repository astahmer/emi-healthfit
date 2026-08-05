Feature: Session sidebar actions
  Scenario: Rename, pin, copy, share, download, clone, archive, and delete from the sidebar
    Given a user is on session one
    When they rename session one to "Renamed One" from the sidebar
    And they pin session one from the sidebar
    And they copy session one as markdown from the sidebar
    And they share session one from the sidebar
    And they download session one as markdown from the sidebar
    And they clone session one from the sidebar
    And they archive session one from the sidebar
    And they delete session one from the sidebar
    Then session one should not be listed in the sidebar

  Scenario: Unpin, cancel delete, and start a new chat from the header
    Given a user is on session one which is pinned
    When they unpin session one from the sidebar
    And they cancel deleting the active session
    And they start a new chat from the header
    Then the URL should be the new chat page

  Scenario: Restore an archived session from the sidebar
    Given a user has an archived session one
    When they restore the session from the sidebar
    Then the session should no longer be archived

  Scenario: Share copies a session URL and downloads markdown from the sidebar
    Given a user is on session one
    When they share session one from the sidebar
    Then the clipboard should contain "/chat/one"
    When they download session one as markdown from the sidebar
    Then a markdown download should start

  Scenario: Share a session through navigator.share when available
    Given a user is on session one with native sharing mocked
    When they share session one from the sidebar
    Then the native share sheet should receive the session URL
