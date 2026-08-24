import { expect, test } from "@playwright/test";
import { sessionOneSnapshot } from "./mock/app.ts";
import { createChatMock, openMockedChat } from "./mock/install.ts";
import { openSessionActions } from "./open-session-actions.ts";

const branchThread = {
  id: "branch-1",
  conversation_id: "one",
  anchor_message_id: "one-assistant",
  title: "Branch",
  status: "regular" as const,
  pinned: false,
  message_ids: ["one-user", "one-assistant"],
  created_at: "2026-07-14T10:02:00.000Z",
  updated_at: "2026-07-14T10:02:00.000Z",
};

test("clicks a follow-up suggestion and keeps the previous assistant answer", async ({ page }) => {
  const mock = createChatMock({
    state: {
      suggestions: ["Tell me about recovery"],
      chat: { persist: true, replyText: "Recovery looks good" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");

  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tell me about recovery" })).toBeVisible();
  await page.getByRole("button", { name: "Tell me about recovery" }).click();
  await expect(
    page.locator('[id^="message-"]').filter({ hasText: "Tell me about recovery" }),
  ).toBeVisible();
  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByText("Recovery looks good")).toBeVisible();
});

test("recovers an empty assistant message left by an older failed turn", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: {
        one: sessionOneSnapshot({
          messages: [
            {
              id: "one-user",
              conversationId: "one",
              parentId: null,
              role: "user",
              parts: [{ type: "text", text: "Question from an older turn" }],
              createdAt: "2026-07-14T10:00:00.000Z",
            },
            {
              id: "one-assistant",
              conversationId: "one",
              parentId: "one-user",
              role: "assistant",
              parts: [],
              createdAt: "2026-07-14T10:01:00.000Z",
            },
          ],
        }),
      },
      chat: { persist: true, replyText: "Recovered coach reply" },
    },
  });
  await mock.open(page, "/chat/one");

  await expect(page.getByText("Question from an older turn")).toBeVisible();
  await expect(page.getByText("Coach did not finish this reply.")).toBeVisible();
  expect(mock.state.chat.calls).toBe(0);
  await page.reload();
  await expect(page.getByText("Coach did not finish this reply.")).toBeVisible();
  expect(mock.state.chat.calls).toBe(0);
  await page.getByRole("button", { name: "Retry coach response" }).click();
  await expect(page.getByText("Recovered coach reply")).toBeVisible();
  expect(mock.state.chat.lastBody?.replaceMessageId).toBe("one-user");
});

test("resets before delete finishes and sends a new-chat suggestion", async ({ page }) => {
  const mock = createChatMock({
    state: {
      chat: { persist: true, replyText: "Workout summary" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  mock.holdDelete();
  await mock.open(page, "/chat/one");

  await expect(page.getByText("one message answer")).toBeVisible();
  await openSessionActions(page);
  await page.getByText("Delete", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL(/\/chat\/?$/);
  await expect(page.getByRole("button", { name: "Summarize my last workout." })).toBeVisible();
  expect(mock.state.conversations.some((conversation) => conversation.id === "one")).toBe(true);

  mock.releaseDelete();
  await expect
    .poll(() => mock.state.conversations.find((conversation) => conversation.id === "one"))
    .toBeUndefined();

  await page.getByRole("button", { name: "Summarize my last workout." }).click();
  await expect(page.getByText("Workout summary")).toBeVisible();
  expect(mock.state.chat.calls).toBe(1);
  expect(mock.state.chat.lastBody?.sessionId).toMatch(/^fresh-/);
  expect(mock.state.chat.lastBody?.sessionId).not.toBe("one");
});

test("deletes the active conversation after entering it from the new-chat route", async ({
  page,
}) => {
  const mock = createChatMock({
    state: {
      chat: { persist: true, replyText: "Workout summary" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat");

  await page.getByRole("link", { name: "Session One" }).click();
  await expect(page).toHaveURL(/\/chat\/one$/);
  await expect(page.getByText("one message answer")).toBeVisible();

  await openSessionActions(page);
  await page.getByText("Delete", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL(/\/chat\/?$/);
  await expect(page.getByRole("button", { name: "Summarize my last workout." })).toBeVisible();
  await expect(page.getByText("one message answer")).toHaveCount(0);
  expect(mock.state.conversations.some((conversation) => conversation.id === "one")).toBe(false);
});

test("does not resurrect a deleted conversation from stale message loads", async ({ page }) => {
  const mock = createChatMock({
    state: {
      chat: { persist: true, replyText: "Workout summary" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  mock.holdMessages();
  await mock.open(page, "/chat/one");

  await page.getByRole("link", { name: "Session One" }).click();
  await expect(page).toHaveURL(/\/chat\/one$/);

  await openSessionActions(page);
  await page.getByText("Delete", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL(/\/chat\/?$/);
  mock.releaseMessages();

  await expect(page.getByRole("button", { name: "Summarize my last workout." })).toBeVisible();
  await expect(page.getByText("one message answer")).toHaveCount(0);
});

test("sends another typed message and keeps the previous assistant answer", async ({ page }) => {
  const mock = createChatMock({
    state: {
      chat: { persist: true, replyText: "Sleep more tonight" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");

  await expect(page.getByText("one message answer")).toBeVisible();
  await page.getByLabel("Message input").fill("What about sleep?");
  await page.getByLabel("Send message").click();
  await expect(
    page.locator('[id^="message-"]').filter({ hasText: "What about sleep?" }),
  ).toBeVisible();
  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByText("Sleep more tonight")).toBeVisible();
});

test("stops a mid-stream generation", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { replyText: "Should not appear" },
    },
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("Please stop me");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();
  await page.getByLabel("Stop generating").click();
  mock.releaseChat();

  await expect(page.getByLabel("Send message")).toBeVisible();
  await expect(page.getByText("Should not appear")).toHaveCount(0);
});

test("queues a follow-up while streaming and keeps the live assistant answer", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Live answer" },
    },
  });
  const replies = ["Live answer", "Follow-up answer"];
  Object.defineProperty(mock.state.chat, "replyText", {
    configurable: true,
    get: () => replies[Math.max(0, mock.state.chat.calls - 1)] ?? "Mock answer",
    set: () => undefined,
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("First question");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();

  await page.getByLabel("Message input").fill("Second question");
  await page.getByLabel("Send after reply").click();
  await expect(page.getByLabel("Queued follow-ups")).toContainText("Second question");
  await expect(page.getByText("one message answer")).toBeVisible();

  mock.releaseChat();

  await expect(
    page.locator('[id^="message-"]').filter({ hasText: "First question" }),
  ).toBeVisible();
  await expect(page.getByText("Live answer")).toBeVisible();
  await expect(
    page.locator('[id^="message-"]').filter({ hasText: "Second question" }),
  ).toBeVisible();
  await expect(page.getByText("Follow-up answer")).toBeVisible();
  await expect(page.getByText("one message answer")).toBeVisible();
  expect(mock.state.chat.calls).toBe(2);
});

test("queues multiple follow-ups, edits with arrows, and cancels one before drain", async ({
  page,
}) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Live answer" },
    },
  });
  const replies = ["Live answer", "Second answer", "Third answer"];
  Object.defineProperty(mock.state.chat, "replyText", {
    configurable: true,
    get: () => replies[Math.max(0, mock.state.chat.calls - 1)] ?? "Mock answer",
    set: () => undefined,
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("First question");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();

  await page.getByLabel("Message input").fill("Queue one");
  await page.getByLabel("Send after reply").click();
  await page.getByLabel("Message input").fill("Queue two");
  await page.getByLabel("Send after reply").click();
  await page.getByLabel("Message input").fill("Queue three");
  await page.getByLabel("Send after reply").click();

  const queue = page.getByLabel("Queued follow-ups");
  await expect(queue).toContainText("Queue one");
  await expect(queue).toContainText("Queue two");
  await expect(queue).toContainText("Queue three");

  await page.getByLabel("Message input").press("ArrowUp");
  await expect(page.getByLabel("Message input")).toHaveValue("Queue three");
  await expect(queue).toContainText("(editing)");
  await page.getByLabel("Message input").fill("Queue three edited");
  await page.getByLabel("Update queued message").click();
  await expect(queue).toContainText("Queue three edited");

  await page.getByLabel("Cancel queued message 2").click();
  await expect(queue).not.toContainText("Queue two");
  await expect(queue).toContainText("Queue one");
  await expect(queue).toContainText("Queue three edited");

  mock.releaseChat();

  await expect(page.getByText("Live answer")).toBeVisible();
  await expect(page.locator('[id^="message-"]').filter({ hasText: "Queue one" })).toBeVisible();
  await expect(page.getByText("Second answer")).toBeVisible();
  await expect(
    page.locator('[id^="message-"]').filter({ hasText: "Queue three edited" }),
  ).toBeVisible();
  await expect(page.getByText("Third answer")).toBeVisible();
  await expect(page.getByText("one message answer")).toBeVisible();
  expect(mock.state.chat.calls).toBe(3);
});

test("force-sends a queued follow-up and interrupts the live generation", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Should not appear" },
    },
  });
  let forceReply = "Should not appear";
  Object.defineProperty(mock.state.chat, "replyText", {
    configurable: true,
    get: () => forceReply,
    set: () => undefined,
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("First question");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();

  await page.getByLabel("Message input").fill("Send me now");
  await page.getByLabel("Send after reply").click();
  await expect(page.getByLabel("Queued follow-ups")).toContainText("Send me now");

  forceReply = "Forced answer";
  await page.getByLabel("Send queued message 1 now").click();
  mock.releaseChat();

  await expect(page.locator('[id^="message-"]').filter({ hasText: "Send me now" })).toBeVisible();
  await expect(page.getByText("Forced answer").first()).toBeVisible();
  await expect(page.getByText("Should not appear")).toHaveCount(0);
  await expect(page.getByText("one message answer")).toBeVisible();
});

test("shares queued follow-ups across tabs for view edit and cancel", async ({ context, page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Live answer" },
    },
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("First question");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();
  await page.getByLabel("Message input").fill("Shared queue item");
  await page.getByLabel("Send after reply").click();
  await expect(page.getByLabel("Queued follow-ups")).toContainText("Shared queue item");

  const secondPage = await context.newPage();
  await mock.install(secondPage);
  await secondPage.goto("/chat/one");
  await expect(secondPage.getByLabel("Queued follow-ups")).toContainText("Shared queue item");

  await secondPage.getByLabel("Edit queued message 1").click();
  await expect(secondPage.getByLabel("Message input")).toHaveValue("Shared queue item");
  await secondPage.getByLabel("Message input").fill("Shared queue edited");
  await secondPage.getByLabel("Update queued message").click();
  await expect(page.getByLabel("Queued follow-ups")).toContainText("Shared queue edited");

  await secondPage.getByLabel("Cancel queued message 1").click();
  await expect(secondPage.getByLabel("Queued follow-ups")).toHaveCount(0);
  await expect(page.getByLabel("Queued follow-ups")).toHaveCount(0);

  mock.releaseChat();
  await expect(page.getByText("Live answer")).toBeVisible();
});

test("relays force-send from a second tab to the streaming tab", async ({ context, page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Should not appear" },
    },
  });
  let forceReply = "Should not appear";
  Object.defineProperty(mock.state.chat, "replyText", {
    configurable: true,
    get: () => forceReply,
    set: () => undefined,
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("First question");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();
  await page.getByLabel("Message input").fill("Relay force send");
  await page.getByLabel("Send after reply").click();

  const secondPage = await context.newPage();
  await mock.install(secondPage);
  await secondPage.goto("/chat/one");
  await expect(secondPage.getByLabel("Queued follow-ups")).toContainText("Relay force send");

  forceReply = "Forced from other tab";
  await secondPage.getByLabel("Send queued message 1 now").click();
  mock.releaseChat();

  await expect(
    page.locator('[id^="message-"]').filter({ hasText: "Relay force send" }),
  ).toBeVisible();
  await expect(page.getByText("Forced from other tab").first()).toBeVisible();
  await expect(secondPage.getByLabel("Queued follow-ups")).toHaveCount(0);
});

test("edits a user message and regenerates an assistant reply", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Edited answer" },
    },
  });
  await mock.open(page, "/chat/one");

  await expect(page.getByText("one message", { exact: true })).toBeVisible();
  await page.getByLabel("Edit message").first().click();
  await page.getByRole("textbox", { name: "Edit message" }).fill("Edited question");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Edited answer")).toBeVisible();

  mock.state.chat.replyText = "Regenerated answer";
  await page.getByLabel("Regenerate response").last().click();
  await expect(page.getByText("Regenerated answer")).toBeVisible();
});

test("regenerates from the last user message action", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Regenerated from user" },
    },
  });
  await mock.open(page, "/chat/one");

  await page.locator("#message-one-user").getByLabel("Regenerate from this message").click();
  await expect(page.getByText("Regenerated from user")).toBeVisible();
  expect(mock.state.chat.lastBody?.replaceMessageId).toBe("one-user");
});

test("forks a branch from an assistant message", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");

  await page.locator("#message-one-assistant").getByLabel("Fork from message").click();
  await expect(page.getByRole("button", { name: "Branch", exact: true })).toBeVisible();
});

test("searches within a conversation that has branches", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot({ threads: [branchThread] }) } },
  });
  await mock.open(page, "/chat/one");

  await page.getByRole("button", { name: "Search conversation" }).click();
  await page.getByLabel("Search this conversation").fill("one message");
  await expect(page.getByText("one message").first()).toBeVisible();
});

test("toggles coach, temporary, and model composer controls", async ({ page }) => {
  await openMockedChat(page, "/chat");
  await page.getByRole("button", { name: /Coach/ }).click();
  await expect(page).toHaveURL(/coach=/);
  await page.getByRole("button", { name: /Temporary/ }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option").nth(1).click();
});

test("renames, pins, archives, clones, copies, shares, and deletes from the sidebar", async ({
  page,
}) => {
  test.setTimeout(40_000);
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await openSessionActions(page);
  await page.getByText("Rename").click();
  await page.getByRole("list").getByRole("textbox").fill("Renamed One");
  await page.getByRole("list").getByRole("textbox").press("Enter");
  await expect(page.getByText("Renamed One").first()).toBeVisible();

  await openSessionActions(page);
  await page.getByText("Pin").click();
  expect(mock.state.conversations.find((conversation) => conversation.id === "one")?.pinned).toBe(
    true,
  );

  await openSessionActions(page);
  await page.getByText("Copy as .md").click();

  await openSessionActions(page);
  await page.getByText("Share").click();

  await openSessionActions(page);
  await page.getByText("Download").click();

  await openSessionActions(page);
  await page.getByText("Clone").click();

  await openSessionActions(page);
  await page.getByText("Archive").click();

  await openSessionActions(page);
  await page.getByText("Delete", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

  await expect
    .poll(() => mock.state.conversations.find((conversation) => conversation.id === "one"))
    .toBeUndefined();
});
