Feature: Tool results
  Scenario: Render tool outputs and tool errors in the assistant reply
    Given a user is on session one with a tool-answering generation
    When they send the message "Run tools"
    Then the tool output "Recovered well" should be visible
    And the tool error "Only one SELECT query is allowed." should be visible
    And the tool name "get recovery" should be visible
    And the tool name "get workout history" should be visible
    And the assistant reply "Mixed tools done" should be displayed

  Scenario: Render reasoning parts and message reference links
    Given a user is on session one with reasoning and a message reference
    When they open the reasoning section
    Then the message "Thinking about recovery metrics." should be displayed
    And the message "Referenced message" should be displayed
    When they click the referenced message link
    Then the referenced user message should be in view

  Scenario: Hydrate rich chat components open while keeping raw tool JSON folded
    Given a user is on session one with rich component tool results
    Then the metric label "Steps" should be visible
    And the recovery explanation "Good recovery" should be visible
    And the exercise "Bench Press" should be visible
