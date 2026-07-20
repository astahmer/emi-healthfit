import { expect, test } from "@playwright/test";
import { createChatMock, multiToolStream, sessionOneSnapshot } from "./mock/install.ts";

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

test("temporary chat does not create a conversation and clears after refresh", async ({
  page,
}) => {
  let createdConversation = false;
  const mock = createChatMock({
    state: { chat: { persist: true, replyText: "Ghost reply" } },
    extend: (app) => {
      app.post("/api/conversations", (context) => {
        createdConversation = true;
        return context.json({ id: "should-not-create" }, 201);
      });
    },
  });
  await mock.open(page, "/chat");

  await page.getByRole("button", { name: /Temporary/ }).click();
  await page.getByLabel("Message input").fill("Ghost note");
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Ghost reply")).toBeVisible();
  expect(createdConversation).toBe(false);
  expect(mock.state.chat.lastBody?.temporary).toBe(true);

  await page.goto("/chat");
  await expect(page.getByText("Ghost reply")).toHaveCount(0);
  await expect(page.getByText("What are we working on?")).toBeVisible();
});

test("enables web search for a web-capable model and sends it on chat", async ({ page }) => {
  const mock = createChatMock({
    state: {
      chat: { persist: true, replyText: "Web answer" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");

  await expect(page.getByRole("button", { name: /Web/ })).toBeDisabled();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /GPT-5\.2$/ }).click();
  await page.getByRole("button", { name: /Web/ }).click();
  await expect(page).toHaveURL(/web=/);

  await page.getByLabel("Message input").fill("Search the web");
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Web answer")).toBeVisible();
  expect(mock.state.chat.lastBody?.webSearch).toBe(true);
  expect(mock.state.chat.lastBody?.config?.model).toBe("gpt-5.2");
});

test("compacts a conversation into a fresh session with summary context", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");

  await page.getByLabel("Compact conversation and start fresh").click();
  await expect(page).toHaveURL(/\/chat\/compacted/);
  await expect(page.getByLabel("Compacted context")).toBeVisible();
  await expect(page.getByText("Prior workout notes.")).toBeVisible();
});

test("sends an attachment with the chat request", async ({ page }) => {
  const mock = createChatMock({
    state: {
      chat: { persist: true, replyText: "Saw the image" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");

  await page.locator('input[type="file"]').setInputFiles({
    name: "progress.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
  await expect(page.getByText("progress.png")).toBeVisible();
  await page.getByLabel("Message input").fill("Look at this");
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Saw the image")).toBeVisible();
  const filePart = mock.state.chat.lastBody?.messages?.[0]?.parts?.find(
    (part) => part.type === "file",
  );
  expect(filePart?.filename).toBe("progress.png");
  expect(filePart?.mediaType).toBe("image/png");
});

test("blocks concurrent submit while streaming", async ({ page }) => {
  const mock = createChatMock({
    state: {
      chat: { replyText: "Only one stream" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("First");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();

  await page.getByLabel("Message input").fill("Second should not send");
  await page.getByLabel("Message input").press("Enter");
  expect(mock.state.chat.calls).toBe(1);

  mock.releaseChat();
  await expect(page.getByLabel("Send message")).toBeVisible();
});

test("continues as guest into chat", async ({ page }) => {
  const mock = createChatMock({ state: { authSession: null } });
  await mock.open(page, "/chat");

  await expect(page.getByRole("heading", { name: /Your training history/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByLabel("Message input")).toBeVisible();
});

test("discards and restores a branch from thread navigation", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot({ threads: [branchThread] }) } },
  });
  await mock.open(page, "/chat/one");

  await expect(page.getByRole("button", { name: "Branch", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Actions for Branch" }).click();
  await page.getByRole("menuitem", { name: "Discard branch" }).click();

  await expect(page.getByRole("button", { name: "Branch", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("menuitem", { name: "Branch" }).click();
  await expect(page.getByRole("button", { name: "Branch", exact: true })).toBeVisible();
});

test("restores an archived session from the sidebar", async ({ page }) => {
  const mock = createChatMock({
    state: {
      conversations: [
        {
          id: "one",
          title: "Session One",
          status: "archived",
          pinned: false,
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T12:00:00.000Z",
        },
      ],
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");

  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ hasText: /Session One/ })
    .first();
  await item.hover();
  await item.getByLabel("Session actions").click();
  await page.getByText("Restaurer").click();
  expect(mock.state.conversations[0]?.status).toBe("regular");
});

test("copies and exports an assistant message", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  const assistant = page.locator("#message-one-assistant");
  await expect(assistant.getByText("one message answer")).toBeVisible();
  await assistant.getByLabel("Copy message").click();
  await expect(page.getByText("Message copied.")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("one message answer");

  const downloadPromise = page.waitForEvent("download");
  await assistant.getByLabel("Export message as Markdown").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^message-.*\.md$/);
});

test("renders multi-tool success and tool-error from a stream", async ({ page }) => {
  const base = sessionOneSnapshot();
  const textOnly = {
    ...base,
    messages: base.messages.map((message) =>
      message.role === "assistant"
        ? { ...message, parts: [{ type: "text", text: "one message answer" }] }
        : message,
    ),
  };
  const mock = createChatMock({
    state: {
      snapshots: { one: textOnly },
      chat: {
        persist: true,
        replyText: "Mixed tools done",
        streamBody: multiToolStream({ messageId: "tools-assistant" }),
        persistAssistantParts: [
          {
            type: "dynamic-tool",
            toolName: "get_recovery",
            toolCallId: "call-1",
            state: "output-available",
            input: {},
            output: { label: "Ready", explanation: "Recovered well" },
          },
          {
            type: "dynamic-tool",
            toolName: "query_database",
            toolCallId: "call-2",
            state: "output-error",
            input: {},
            errorText: "Only one SELECT query is allowed.",
          },
          { type: "text", text: "Mixed tools done" },
        ],
      },
    },
  });
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("Run tools");
  await page.getByLabel("Send message").click();

  const toolsMessage = page.locator("[id^='message-one-assistant-']").last();
  await expect(toolsMessage.getByText("get recovery")).toBeVisible();
  await expect(toolsMessage.getByText("query database")).toBeVisible();
  await expect(toolsMessage.getByText("Completed")).toBeVisible();
  await expect(toolsMessage.getByText("Failed")).toBeVisible();
  await expect(toolsMessage.getByText("Mixed tools done")).toBeVisible();
});
