Feature: Chat scrolling
  Scenario: Restore chat scroll position after refresh
    Given a user is on a tall session one
    When they scroll to a middle position and refresh the page
    Then the scroll position should be restored

  Scenario: Open another session at the newest messages
    Given a user is on a tall session one
    When they scroll to the top and open session two
    Then session two should open at its newest messages

  Scenario: Message rail previews and jumps to a user message
    Given a user is on a tall session one
    When they hover the second rail item
    Then the rail preview should show the second user turn
    When they click the first rail item
    Then the thread should scroll near the first user turn

  Scenario: Message rail sheet jumps to a user message on mobile
    Given a user is on a tall session one on a mobile viewport
    When they open the message rail sheet
    Then the rail sheet should list ten user turns
    When they click the first rail sheet item
    Then the thread should scroll near the first user turn

  Scenario: Scroll to the previous user message jumps above the viewport
    Given a user is on a tall session one
    When they click the previous user message button
    Then the thread should scroll above the previous position

  Scenario: Scroll to oldest jumps to the top of the thread
    Given a user is on a tall session one
    When they click the scroll to top button
    Then the thread should scroll to the top
