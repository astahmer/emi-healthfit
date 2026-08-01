Feature: Generic composer controls

  Scenario: Queue and remove a follow-up during a stream
    Given a configured visitor opens generic chat with a held stream
    When they send the generic message "First Gherkin request"
    And they queue the generic follow-up "Queued Gherkin request"
    Then the queued generic follow-up "Queued Gherkin request" should be visible
    When they remove the queued generic follow-up
    Then the queued generic follow-up "Queued Gherkin request" should not be visible
    When they release the held generic stream
    Then the generic assistant reply should be visible
