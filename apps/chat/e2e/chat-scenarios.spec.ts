import { expect, test } from "@playwright/test";
import { createChatMock, openMockedChat, sessionOneSnapshot } from "./mock/install.ts";
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
  await page.getByText("Renommer").click();
  await page.getByRole("list").getByRole("textbox").fill("Renamed One");
  await page.getByRole("list").getByRole("textbox").press("Enter");
  await expect(page.getByText("Renamed One").first()).toBeVisible();

  await openSessionActions(page);
  await page.getByText("Épingler").click();
  expect(mock.state.conversations.find((conversation) => conversation.id === "one")?.pinned).toBe(
    true,
  );

  await openSessionActions(page);
  await page.getByText("Copier en .md").click();

  await openSessionActions(page);
  await page.getByText("Partager").click();

  await openSessionActions(page);
  await page.getByText("Télécharger").click();

  await openSessionActions(page);
  await page.getByText("Cloner").click();

  await openSessionActions(page);
  await page.getByText("Archiver").click();

  await openSessionActions(page);
  await page.getByText("Supprimer", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();

  await expect
    .poll(() => mock.state.conversations.find((conversation) => conversation.id === "one"))
    .toBeUndefined();
});
