Feature: Composer controls
  Scenario: Enable coach mode
    Given a user is on a new chat page
    When they click the Coach button
    Then the URL should include "coach="

  Scenario: Enable temporary mode
    Given a user is on a new chat page
    When they click the Temporary button
    Then the Temporary button should look active

  Scenario: Select a different model
    Given a user is on a new chat page
    When they select the model "GPT-5.6 Sol"
    Then the model combobox should show "GPT-5.6 Sol"

  Scenario: Enable web search on a web-capable model and send it on chat
    Given a user is on session one that replies "Web answer" to the next message
    When they select the model "GPT-5.6 Terra"
    And they click the Web button
    Then the URL should include "web="
    When they send the message "Search the web"
    Then the assistant reply "Web answer" should be displayed
    And the last request should enable web search

  Scenario: Toggle coach, temporary, and model composer controls
    Given a user is on a new chat page
    When they click the Coach button
    Then the URL should include "coach="
    When they click the Temporary button
    And they select the model "GPT-5.6 Sol"
    Then the model combobox should show "GPT-5.6 Sol"

  Scenario: Keep the composer draft while a response is streaming
    Given a user is on session one with a held generation
    When they type "Typed while streaming" while the reply is held
    Then the draft "Typed while streaming" should be preserved after the reply finishes

  Scenario: A sent message clears its saved draft across reloads
    Given a user is on session one that replies "Draft answer" to the next message
    When they type the draft "Remember this"
    And they send the message "Remember this"
    Then the assistant reply "Draft answer" should be displayed
    When they reload the page
    Then the composer draft should be empty

  Scenario: A manually cleared draft stays cleared across reloads
    Given a user is on session one that replies "Draft answer" to the next message
    When they type the draft "To discard"
    And they clear the composer draft
    And they reload the page
    Then the composer draft should be empty
