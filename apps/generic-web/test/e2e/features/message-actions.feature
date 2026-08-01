Feature: Generic message actions

  Scenario: Copy an assistant message
    Given a configured visitor opens generic chat
    When they send the generic message "Copy this generic answer"
    And they copy the generic assistant message
    Then the generic message copied status should be visible
