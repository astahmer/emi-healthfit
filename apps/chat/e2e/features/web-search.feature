Feature: Web search
  Scenario: Enable web search on a capable model
    Given a user is on session one
    When they select the model "GPT-5.2"
    And they click the Web button
    Then the URL should include "web="
