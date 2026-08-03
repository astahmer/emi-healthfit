import { expect, test } from "@playwright/test";
import { sessionOneSnapshot } from "./mock/app.ts";
import { assistantStream, conversations } from "./mock/fixtures.ts";
import { createChatMock, fulfillMockApi, installMockApi, openMockedChat } from "./mock/install.ts";

test("requires an OpenAI API key before showing the chat composer", async ({ page }) => {
  const mock = createChatMock();
  await installMockApi({ page, app: mock.app });
  await page.goto("/chat");

  await expect(page.getByText("Add your OpenAI API key")).toBeVisible();
  await expect(page.getByLabel("Message input")).toHaveCount(0);
  await page.getByLabel("OpenAI API key").fill("sk-test");
  await page.getByRole("button", { name: "Save key and start chatting" }).click();
  await expect(page.getByLabel("Message input")).toBeVisible();
});

test("switches sessions, renders tools, and starts a new chat", async ({ page }) => {
  await openMockedChat(page, "/chat/one");

  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByText("Ready")).toBeVisible();
  await page.getByText("Session Two", { exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/two$/);
  await expect(page.getByText("two message answer")).toBeVisible();
  await page.getByLabel("New chat").click();
  await expect(page).toHaveURL(/\/chat\/?$/);
  await expect(page.getByText("What are we working on?")).toBeVisible();
});

test("sends the first message from a new empty conversation", async ({ page }) => {
  const mock = createChatMock({
    state: {
      createConversationId: "fresh",
      chat: { persist: true, replyText: "Fresh answer" },
      snapshots: {
        fresh: {
          conversation: {
            id: "fresh",
            title: null,
            status: "regular",
            pinned: false,
            created_at: "2026-07-17T00:00:00.000Z",
            updated_at: "2026-07-17T00:00:00.000Z",
          },
          messages: [],
          threads: [],
        },
      },
    },
  });
  mock.holdChat();
  await mock.open(page, "/chat");

  await page.getByLabel("Message input").fill("First message");
  const chatResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.request().method() === "POST",
  );
  await page.getByLabel("Send message").click();

  await expect(page).toHaveURL(/\/chat\/fresh$/);
  await expect(page.getByText("First message")).toBeVisible();
  await expect(page.getByLabel("Assistant is working")).toBeVisible();
  mock.releaseChat();

  expect((await chatResponse).ok()).toBe(true);
  await expect(page.getByText("Fresh answer")).toBeVisible();
  expect(mock.state.chat.lastBody).toEqual(
    expect.objectContaining({
      sessionId: "fresh",
      messages: [
        expect.objectContaining({
          role: "user",
          parts: [{ type: "text", text: "First message" }],
        }),
      ],
    }),
  );
});

test("shows cached sidebar and messages when refresh loses the API", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
  await page.waitForTimeout(250);

  await page.unroute("**/api/**");
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/auth/get-session") {
      await fulfillMockApi({ route, app: mock.app });
      return;
    }
    await route.abort("internetdisconnected");
  });
  await page.reload();

  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
});

test("previews an attachment before sending", async ({ page }) => {
  await openMockedChat(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "progress.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });

  await expect(page.getByText("progress.png")).toBeVisible();
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible();
});

test("sends the first message in an existing conversation with empty history", async ({ page }) => {
  const emptyConversation = {
    id: "empty",
    title: "Empty conversation",
    status: "regular" as const,
    pinned: false,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  };
  const mock = createChatMock({
    state: {
      conversations: [...conversations, emptyConversation],
      snapshots: {
        empty: { conversation: emptyConversation, messages: [], threads: [] },
      },
      chat: { persist: true, replyText: "Chat started" },
    },
  });
  await mock.open(page, "/chat/empty");

  await expect(page.getByText("What are we working on?")).toBeVisible();
  await page.getByLabel("Message input").fill("Start this chat");
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Chat started")).toBeVisible();
  expect(mock.state.chat.lastBody).toEqual(
    expect.objectContaining({
      sessionId: "empty",
      messages: [
        expect.objectContaining({
          role: "user",
          parts: [{ type: "text", text: "Start this chat" }],
        }),
      ],
    }),
  );
});

test("surfaces generation-already-running conflicts from a 409", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: {
        failStatus: 409,
        failBody: JSON.stringify({
          error: "A generation is already running",
          generationId: "generation-conflict-1",
        }),
      },
    },
  });
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("Overlapping send");
  await page.getByLabel("Send message").click();
  await expect(
    page.getByText(
      "A reply is already in progress elsewhere. Wait for it to finish, or stop it there.",
    ),
  ).toBeVisible();
  expect(mock.state.chat.calls).toBe(1);
});

test("accepts a new request after a persisted orphaned turn", async ({ page }) => {
  const orphanMessageId = "30dd4f3b-02af-4168-83cc-f70d395c715c";
  const base = sessionOneSnapshot();
  const mock = createChatMock({
    state: {
      snapshots: {
        one: {
          ...base,
          messages: [
            ...base.messages,
            {
              id: orphanMessageId,
              conversationId: "one",
              parentId: null,
              role: "user",
              parts: [{ type: "text", text: "Previous request" }],
              createdAt: "2026-07-17T00:00:02.000Z",
            },
          ],
        },
      },
      chat: { persist: true, replyText: "Continued response" },
    },
  });
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("Continue with a new request");
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Continued response")).toBeVisible();
  expect(mock.state.chat.lastBody).toEqual(
    expect.objectContaining({
      messages: [
        expect.objectContaining({ parts: [{ type: "text", text: "Continue with a new request" }] }),
      ],
    }),
  );
  expect(mock.state.chat.lastBody).not.toHaveProperty("replaceMessageId");
});

test("navigates production-built data pages and renders empty states", async ({ page }) => {
  await openMockedChat(page, "/upload");

  await expect(page.getByRole("heading", { name: "Upload data" })).toBeVisible();
  await page.getByRole("link", { name: "Workouts" }).click();
  await expect(
    page.getByText("No workouts found. Upload a Hevy export to get started."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Trends" }).click();
  await expect(page.getByRole("heading", { name: "Health overview" })).toBeVisible();
  await page.getByRole("link", { name: "Notes" }).click();
  await expect(page.getByText("No notes yet.")).toBeVisible();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("resumes an unfinished generation after refresh", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot({ text: "Resumed" }) },
      chat: {
        resumeStreamBody: assistantStream({
          messageId: "resumed-assistant",
          text: "Resumed answer",
        }),
      },
    },
  });
  await mock.open(page, "/chat/one");

  await expect(page.getByText("Resumed answer")).toBeVisible();
  await expect(page.getByText("Resumed answer")).toHaveCount(1);
  await expect(page.locator('[id^="message-"]')).toHaveCount(2);
  expect(mock.state.chat.resumeCalls).toBeGreaterThan(0);
});

test("shows persisted completion after a stream ends without finish", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: {
        persist: true,
        replyText: "Persisted completion",
        streamBody: [
          'data: {"type":"start","messageId":"persisted-assistant"}',
          'data: {"type":"text-start","id":"persisted-text"}',
          'data: {"type":"text-delta","id":"persisted-text","delta":"Persisted completion"}',
          "",
        ].join("\n\n"),
      },
    },
  });
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("Complete despite truncation");
  const truncatedResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.request().method() === "POST",
  );
  await page.getByLabel("Send message").click();
  await truncatedResponse;
  await page.reload();

  await expect(page.getByText("Persisted completion")).toBeVisible();
  await expect(page.getByText("Generation timed out")).not.toBeVisible();
});

test("creates, edits, searches, and deletes notes through the notes page", async ({ page }) => {
  const mock = createChatMock({
    state: {
      notes: [
        {
          id: "note-existing",
          content: "Keep one full rest day",
          created_at: "2026-07-18T10:00:00.000Z",
          updated_at: "2026-07-18T10:00:00.000Z",
        },
      ],
    },
  });
  await mock.open(page, "/notes");

  await expect(page.getByText("Keep one full rest day")).toBeVisible();
  await page.getByPlaceholder("Add a note…").fill("Track sleep before hard sessions");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Track sleep before hard sessions")).toBeVisible();
  const createdNote = page
    .getByRole("listitem")
    .filter({ hasText: "Track sleep before hard sessions" });
  await createdNote.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("listitem").getByRole("textbox").fill("Track sleep before long runs");
  await page.getByRole("listitem").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Track sleep before long runs")).toBeVisible();
  await page.getByPlaceholder("Search notes…").fill("rest");
  await expect(page.getByText("Keep one full rest day")).toBeVisible();
  await expect(page.getByText("Track sleep before long runs")).toHaveCount(0);
  await page.getByPlaceholder("Search notes…").fill("");
  const updatedNote = page
    .getByRole("listitem")
    .filter({ hasText: "Track sleep before long runs" });
  await updatedNote.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Track sleep before long runs")).toHaveCount(0);
});

test("creates, filters, and deletes manually saved memories", async ({ page }) => {
  const mock = createChatMock({
    state: {
      memories: [
        {
          id: "memory-existing",
          content: "Enjoys early training",
          source: "manual",
          thread_id: null,
          created_at: "2026-07-18T10:00:00.000Z",
        },
      ],
    },
  });
  await mock.open(page, "/memory");

  await expect(page.getByText("Enjoys early training")).toBeVisible();
  await page.getByPlaceholder("Save a memory…").fill("Prefers Wednesday rest days");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Memory saved.")).toBeVisible();
  await page.getByPlaceholder("Search memories…").fill("Wednesday");
  await expect(page.getByText("Prefers Wednesday rest days")).toBeVisible();
  await expect(page.getByText("Enjoys early training")).toHaveCount(0);
  const createdMemory = page
    .getByRole("listitem")
    .filter({ hasText: "Prefers Wednesday rest days" });
  await createdMemory.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Memory removed.")).toBeVisible();
  await expect(page.getByText("Prefers Wednesday rest days")).toHaveCount(0);
});

test("shows and edits the merged memory summary alongside source memories", async ({ page }) => {
  const mock = createChatMock({
    state: {
      memories: [
        {
          id: "memory-source",
          content: "Prefers Wednesday rest days",
          source: "manual",
          thread_id: null,
          created_at: "2026-07-18T10:00:00.000Z",
        },
      ],
      memorySummary: {
        content: "The user prefers concise training guidance.",
        memory_count: 1,
        updated_at: "2026-07-18T10:00:00.000Z",
      },
    },
  });
  await mock.open(page, "/memory");

  const summary = page.getByLabel("Merged memory summary");
  await expect(summary).toHaveValue("The user prefers concise training guidance.");
  await summary.fill("The user prefers concise and recovery-aware guidance.");
  await page.getByRole("button", { name: "Save summary" }).click();
  await expect(page.getByText("Memory summary saved.")).toBeVisible();
  await expect(summary).toHaveValue("The user prefers concise and recovery-aware guidance.");
  await expect(page.getByText("Prefers Wednesday rest days")).toBeVisible();
});

const manyNotes = Array.from({ length: 40 }, (_, index) => ({
  id: `note-scroll-${index}`,
  content: `Scrollable note ${index} with enough text to force overflow on the notes page.`,
  created_at: "2026-07-18T10:00:00.000Z",
  updated_at: "2026-07-18T10:00:00.000Z",
}));

const manyMemories = Array.from({ length: 40 }, (_, index) => ({
  id: `memory-scroll-${index}`,
  content: `Scrollable memory ${index} with enough text to force overflow on the memory page.`,
  source: "manual",
  thread_id: null,
  created_at: "2026-07-18T10:00:00.000Z",
}));

const assertPageScrollsToBottom = async ({
  page,
  lastText,
}: {
  page: import("@playwright/test").Page;
  lastText: string;
}) => {
  const scrollRegion = page.getByTestId("app-scroll-region");
  const lastItem = page.getByText(lastText);
  await expect(lastItem).toBeAttached();
  await expect(scrollRegion).toBeVisible();
  const metrics = await scrollRegion.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 1);
  await lastItem.scrollIntoViewIfNeeded();
  await expect(lastItem).toBeInViewport();
  const scrollTop = await scrollRegion.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
};

test("notes page can scroll to the bottom when content overflows", async ({ page }) => {
  const mock = createChatMock({ state: { notes: manyNotes } });
  await mock.open(page, "/notes");
  await assertPageScrollsToBottom({
    page,
    lastText: "Scrollable note 39 with enough text to force overflow on the notes page.",
  });
});

test("memory page can scroll to the bottom when content overflows", async ({ page }) => {
  const mock = createChatMock({ state: { memories: manyMemories } });
  await mock.open(page, "/memory");
  await assertPageScrollsToBottom({
    page,
    lastText: "Scrollable memory 39 with enough text to force overflow on the memory page.",
  });
});
