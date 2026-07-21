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
