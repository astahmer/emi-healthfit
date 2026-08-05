Feature: Tool results
  Scenario: Render tool outputs and tool errors in the assistant reply
    Given a user is on session one with a tool-answering generation
    When they send the message "Run tools"
    Then the tool output "Recovered well" should be visible
    And the tool error "Only one SELECT query is allowed." should be visible
    And the tool name "get recovery" should be visible
    And the tool name "get workout history" should be visible
    And the assistant reply "Mixed tools done" should be displayed
