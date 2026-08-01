Feature: Generic conversation compaction

  Scenario: Compact a generic conversation
    Given a configured visitor opens generic chat
    When they send the generic message "Compact this generic chat"
    And they compact the generic conversation
    Then the generic compact endpoint should be called
