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

test("temporary chat does not create a conversation and clears after refresh", async ({ page }) => {
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

test("temporary chat streams in-memory without fetching persisted messages", async ({ page }) => {
  const messageFetches: string[] = [];
  const mock = createChatMock({
    state: { chat: { replyText: "Ephemeral reply" } },
    extend: (app) => {
      app.get("/api/conversations/:id/messages", (context) => {
        const id = context.req.param("id");
        messageFetches.push(id);
        if (id.startsWith("temp_")) {
          return context.json({ _tag: "NotFound", message: "Conversation not found" }, 404);
        }
        return context.json({ error: "unexpected conversation fetch" }, 500);
      });
    },
  });
  await mock.open(page, "/chat");

  await page.getByRole("button", { name: /Temporary/ }).click();
  await page.getByLabel("Message input").fill("Ephemeral note");
  const chatResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.request().method() === "POST",
  );
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Ephemeral note")).toBeVisible();
  expect((await chatResponse).ok()).toBe(true);
  await expect(page.getByText("Ephemeral reply")).toBeVisible();
  expect(mock.state.chat.lastBody?.temporary).toBe(true);
  expect(page.url()).toMatch(/\/chat\/?$/);
  expect(messageFetches.filter((id) => id.startsWith("temp_"))).toEqual([]);
});

test("keeps a temporary chat as a normal conversation", async ({ page }) => {
  const mock = createChatMock({
    state: {
      createConversationId: "kept-ghost",
      chat: { persist: true, replyText: "Ghost reply" },
    },
  });
  await mock.open(page, "/chat");

  await page.getByRole("button", { name: /Temporary/ }).click();
  await page.getByLabel("Message input").fill("Ghost note");
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Ghost reply")).toBeVisible();
  await expect(page.getByRole("button", { name: /Keep/ })).toBeVisible();

  await page.getByRole("button", { name: /Keep/ }).click();
  await expect(page).toHaveURL(/\/chat\/kept-ghost/);
  await expect(page.getByText("Temporary chat kept.")).toBeVisible();
  await expect(page.getByText("Ghost note")).toBeVisible();
  await expect(page.getByText("Ghost reply")).toBeVisible();
  await expect(page.getByRole("button", { name: /Temporary/ })).toBeVisible();
  expect(mock.state.conversations.some((conversation) => conversation.id === "kept-ghost")).toBe(
    true,
  );
  expect(mock.state.snapshots["kept-ghost"]?.messages.length).toBeGreaterThan(0);
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

test("queues the second message while a stream is in flight", async ({ page }) => {
  const mock = createChatMock({
    state: {
      chat: { persist: true, replyText: "Second reply" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("First");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();

  await page.getByLabel("Message input").fill("Second question");
  await expect(page.getByLabel("Send after reply")).toBeVisible();
  await page.getByLabel("Send after reply").click();
  expect(mock.state.chat.calls).toBe(1);

  mock.releaseChat();
  await expect(page.getByText("Second question")).toBeVisible();
  await expect(page.getByText("Second reply").last()).toBeVisible();
});

test("keeps composer draft text while a response is streaming", async ({ page }) => {
  const mock = createChatMock({
    state: {
      chat: { replyText: "Eventually done" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("First");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();

  await page.getByLabel("Message input").fill("Typed while streaming");
  await expect(page.getByLabel("Message input")).toHaveValue("Typed while streaming");
  await expect(page.getByLabel("Send after reply")).toBeVisible();

  mock.releaseChat();
  await expect(page.getByLabel("Send message")).toBeVisible();
  await expect(page.getByLabel("Message input")).toHaveValue("Typed while streaming");
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
            toolName: "get_workout_history",
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
  await expect(toolsMessage.getByText("get workout history")).toBeVisible();
  await expect(toolsMessage.getByText("Completed")).toBeVisible();
  await expect(toolsMessage.getByText("Failed")).toBeVisible();
  await expect(toolsMessage.getByText("Mixed tools done")).toBeVisible();
});

test("hydrates rich chat components open while keeping raw tool JSON folded", async ({ page }) => {
  const snapshot = sessionOneSnapshot();
  const assistant = snapshot.messages.find((message) => message.role === "assistant");
  if (assistant === undefined)
    throw new Error("Expected an assistant message in the chat fixture.");
  assistant.parts = [
    {
      type: "dynamic-tool",
      toolName: "get_summary",
      toolCallId: "summary-1",
      state: "output-available",
      output: { dailyActivity: 1655 },
    },
    {
      type: "dynamic-tool",
      toolName: "get_recovery",
      toolCallId: "recovery-1",
      state: "output-available",
      output: { label: "Ready", explanation: "Good recovery" },
    },
    {
      type: "dynamic-tool",
      toolName: "get_exercise_progress",
      toolCallId: "progress-1",
      state: "output-available",
      output: {
        exercise_title: "Bench Press",
        weeks: 8,
        workouts: [
          {
            session_id: "workout-1",
            title: "Full body",
            start_time: "2026-07-28T10:00:00.000Z",
            max_weight_kg: 100,
            max_volume_kg: 1200,
            total_volume_kg: 2072,
            total_reps: 24,
            sets: 3,
          },
        ],
        personalRecord: { weight_kg: 100, reps: 5, volume_kg: 500 },
      },
    },
    {
      type: "dynamic-tool",
      toolName: "render_component",
      toolCallId: "metric-1",
      state: "output-available",
      output: {
        spec: {
          root: "metric",
          elements: {
            metric: {
              type: "MetricCard",
              props: { value: 8742, unit: "steps/day", trend: "stable" },
            },
          },
        },
      },
    },
  ];
  const mock = createChatMock({ state: { snapshots: { one: snapshot } } });
  await mock.open(page, "/chat/one");

  const rawTool = page.locator("details").filter({ hasText: "get summary" });
  const recoveryTool = page.locator("details").filter({ hasText: "get recovery" });
  const progressTool = page.locator("details").filter({ hasText: "get exercise progress" });
  const metricTool = page.locator("details").filter({ hasText: "render component" });

  await expect(rawTool).not.toHaveAttribute("open");
  await expect(recoveryTool).toHaveAttribute("open", "");
  await expect(progressTool).toHaveAttribute("open", "");
  await expect(metricTool).toHaveAttribute("open", "");
  await expect(page.getByText("Ready")).toBeVisible();
  await expect(page.getByText("Bench Press")).toBeVisible();
  await expect(page.getByText("Metric")).toBeVisible();
  await expect(page.getByText("flat")).toBeVisible();
  await expect(metricTool.locator("pre")).toHaveCount(0);
  const chart = progressTool.getByTestId("exercise-progress-chart");
  await expect(chart).toBeVisible();
  expect(await chart.evaluate((element) => element.clientWidth)).toBeGreaterThan(0);
  await expect(chart.locator("svg")).toHaveCount(1);

  await page.reload();
  await expect(page.getByText("Bench Press")).toBeVisible();
  await expect(page.getByText("Metric")).toBeVisible();
});
