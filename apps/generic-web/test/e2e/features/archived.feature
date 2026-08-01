Feature: Generic conversation lifecycle

  Scenario: Rename, archive, and restore a conversation
    Given a configured visitor opens generic chat
    When they send the generic message "Lifecycle message"
    And they rename the generic conversation to "Renamed generic chat"
    Then the generic conversation "Renamed generic chat" should be visible
    When they archive the generic conversation
    Then the generic conversation should offer restore
    When they restore the generic conversation
    Then the generic conversation should offer archive
