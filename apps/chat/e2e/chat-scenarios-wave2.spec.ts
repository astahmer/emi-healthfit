import { expect, test, type Page } from "@playwright/test";
import {
  assistantStream,
  authSessionBody,
  conversationPayload,
  fulfillMockApi,
  multiToolStream,
  setTestSettings,
} from "./mock/install.ts";

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

const holdableStream = () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release: () => release() };
};

const fulfillChatStream = async ({
  route,
  messageId,
  text,
  body,
}: {
  route: Parameters<Parameters<Page["route"]>[1]>[0];
  messageId: string;
  text: string;
  body?: string;
}) => {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-thread-id": "one",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body: body ?? assistantStream({ messageId, text }),
  });
};

test("temporary chat does not create a conversation and clears after refresh", async ({
  page,
}) => {
  let createdConversation = false;
  let chatBody: { temporary?: boolean } | undefined;
  let tempMessages: unknown[] = [];

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/conversations") {
      createdConversation = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "should-not-create" }),
      });
      return;
    }
    if (
      request.method() === "GET" &&
      url.pathname.startsWith("/api/conversations/temp_") &&
      url.pathname.endsWith("/messages")
    ) {
      const id = url.pathname.split("/")[3] ?? "temp";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id,
            title: null,
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:00.000Z",
          },
          messages: tempMessages,
          threads: [],
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      chatBody = request.postDataJSON() as { temporary?: boolean };
      const userText =
        (
          chatBody as {
            messages?: Array<{ parts?: Array<{ type?: string; text?: string }> }>;
          }
        ).messages?.[0]?.parts?.find((part) => part.type === "text")?.text ?? "Ghost note";
      tempMessages = [
        {
          id: "temp-user",
          conversationId: "temp",
          parentId: null,
          role: "user",
          parts: [{ type: "text", text: userText }],
          createdAt: "2026-07-20T00:00:00.000Z",
        },
        {
          id: "temp-assistant",
          conversationId: "temp",
          parentId: null,
          role: "assistant",
          parts: [{ type: "text", text: "Ghost reply" }],
          createdAt: "2026-07-20T00:00:01.000Z",
        },
      ];
      await fulfillChatStream({ route, messageId: "temp-assistant", text: "Ghost reply" });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat");

  await page.getByRole("button", { name: /Temporary/ }).click();
  await page.getByLabel("Message input").fill("Ghost note");
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Ghost reply")).toBeVisible();
  expect(createdConversation).toBe(false);
  expect(chatBody?.temporary).toBe(true);

  await page.goto("/chat");
  await expect(page.getByText("Ghost reply")).toHaveCount(0);
  await expect(page.getByText("What are we working on?")).toBeVisible();
});

test("enables web search for a web-capable model and sends it on chat", async ({ page }) => {
  let chatBody: { webSearch?: boolean; config?: { model?: string } } | undefined;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      chatBody = request.postDataJSON() as typeof chatBody;
      await fulfillChatStream({ route, messageId: "web-assistant", text: "Web answer" });
      return;
    }
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...payload,
          messages: [
            ...payload.messages,
            ...(chatBody === undefined
              ? []
              : [
                  {
                    id: "web-user",
                    conversationId: "one",
                    parentId: null,
                    role: "user",
                    parts: [{ type: "text", text: "Search the web" }],
                    createdAt: "2026-07-20T00:00:00.000Z",
                  },
                  {
                    id: "web-assistant",
                    conversationId: "one",
                    parentId: null,
                    role: "assistant",
                    parts: [{ type: "text", text: "Web answer" }],
                    createdAt: "2026-07-20T00:00:01.000Z",
                  },
                ]),
          ],
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await expect(page.getByRole("button", { name: /Web/ })).toBeDisabled();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /GPT-5\.2$/ }).click();
  await page.getByRole("button", { name: /Web/ }).click();
  await expect(page).toHaveURL(/web=/);

  await page.getByLabel("Message input").fill("Search the web");
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Web answer")).toBeVisible();
  expect(chatBody?.webSearch).toBe(true);
  expect(chatBody?.config?.model).toBe("gpt-5.2");
});

test("compacts a conversation into a fresh session with summary context", async ({ page }) => {
  let compacted = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/conversations/one/compact") {
      compacted = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "compacted",
            title: "Session One (compacted)",
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T12:00:00.000Z",
            updated_at: "2026-07-20T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/compacted/messages") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "compacted",
            title: "Session One (compacted)",
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T12:00:00.000Z",
            updated_at: "2026-07-20T12:00:00.000Z",
          },
          messages: [
            {
              id: "summary-1",
              conversationId: "compacted",
              parentId: null,
              role: "summary",
              parts: [
                {
                  type: "text",
                  text: "Use this compacted summary of the previous conversation as context:\nPrior workout notes.",
                },
              ],
              createdAt: "2026-07-20T12:00:00.000Z",
            },
          ],
          threads: [],
        }),
      });
      return;
    }
    if (url.pathname === "/api/conversations") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversations: [
            {
              id: "one",
              title: "Session One",
              status: "regular",
              pinned: false,
              created_at: "2026-07-14T10:00:00.000Z",
              updated_at: "2026-07-14T12:00:00.000Z",
            },
            {
              id: "compacted",
              title: "Session One (compacted)",
              status: "regular",
              pinned: false,
              created_at: "2026-07-20T12:00:00.000Z",
              updated_at: "2026-07-20T12:00:00.000Z",
            },
          ],
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Compact conversation and start fresh").click();
  await expect(page).toHaveURL(/\/chat\/compacted/);
  await expect(page.getByLabel("Compacted context")).toBeVisible();
  await expect(page.getByText("Prior workout notes.")).toBeVisible();
  expect(compacted).toBe(true);
});

test("sends an attachment with the chat request", async ({ page }) => {
  let chatBody:
    | {
        messages?: Array<{ parts?: Array<{ type?: string; filename?: string; mediaType?: string }> }>;
      }
    | undefined;
  let sent = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      chatBody = request.postDataJSON() as typeof chatBody;
      sent = true;
      await fulfillChatStream({ route, messageId: "attach-assistant", text: "Saw the image" });
      return;
    }
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...payload,
          messages: sent
            ? [
                ...payload.messages,
                {
                  id: "attach-user",
                  conversationId: "one",
                  parentId: null,
                  role: "user",
                  parts: [
                    { type: "text", text: "Look at this" },
                    {
                      type: "file",
                      filename: "progress.png",
                      mediaType: "image/png",
                      url: "data:image/png;base64,aW1hZ2U=",
                    },
                  ],
                  createdAt: "2026-07-20T00:00:00.000Z",
                },
                {
                  id: "attach-assistant",
                  conversationId: "one",
                  parentId: null,
                  role: "assistant",
                  parts: [{ type: "text", text: "Saw the image" }],
                  createdAt: "2026-07-20T00:00:01.000Z",
                },
              ]
            : payload.messages,
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.locator('input[type="file"]').setInputFiles({
    name: "progress.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
  await expect(page.getByText("progress.png")).toBeVisible();
  await page.getByLabel("Message input").fill("Look at this");
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Saw the image")).toBeVisible();
  const filePart = chatBody?.messages?.[0]?.parts?.find((part) => part.type === "file");
  expect(filePart?.filename).toBe("progress.png");
  expect(filePart?.mediaType).toBe("image/png");
});

test("blocks concurrent submit while streaming", async ({ page }) => {
  const hold = holdableStream();
  let chatCalls = 0;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      chatCalls += 1;
      await hold.gate;
      await fulfillChatStream({
        route,
        messageId: "concurrent-assistant",
        text: "Only one stream",
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Message input").fill("First");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();

  await page.getByLabel("Message input").fill("Second should not send");
  await page.getByLabel("Message input").press("Enter");
  expect(chatCalls).toBe(1);

  hold.release();
  await expect(page.getByLabel("Send message")).toBeVisible();
});

test("continues as guest into chat", async ({ page }) => {
  let signedIn = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/get-session") {
      await route.fulfill({
        contentType: "application/json",
        body: signedIn ? JSON.stringify(authSessionBody) : "null",
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/auth/sign-in/anonymous") {
      signedIn = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat");

  await expect(page.getByRole("heading", { name: /Your training history/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByLabel("Message input")).toBeVisible();
});

test("discards and restores a branch from thread navigation", async ({ page }) => {
  let threadStatus: "regular" | "discarded" = "regular";
  const patches: Array<{ status?: string }> = [];

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...payload,
          threads: [{ ...branchThread, status: threadStatus }],
        }),
      });
      return;
    }
    if (request.method() === "PATCH" && url.pathname === "/api/threads/branch-1") {
      const body = request.postDataJSON() as { status?: "regular" | "discarded" };
      patches.push(body);
      if (body.status !== undefined) threadStatus = body.status;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await expect(page.getByRole("button", { name: "Branch", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Actions for Branch" }).click();
  await page.getByRole("menuitem", { name: "Discard branch" }).click();

  await expect(page.getByRole("button", { name: "Branch", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("menuitem", { name: "Branch" }).click();
  await expect(page.getByRole("button", { name: "Branch", exact: true })).toBeVisible();
  expect(patches).toEqual([{ status: "discarded" }, { status: "regular" }]);
});

test("restores an archived session from the sidebar", async ({ page }) => {
  let status: "regular" | "archived" = "archived";
  let restored = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversations: [
            {
              id: "one",
              title: "Session One",
              status,
              pinned: false,
              created_at: "2026-07-14T10:00:00.000Z",
              updated_at: "2026-07-14T12:00:00.000Z",
            },
          ],
        }),
      });
      return;
    }
    if (request.method() === "PATCH" && url.pathname === "/api/conversations/one") {
      const body = request.postDataJSON() as { status?: "regular" | "archived" };
      if (body.status === "regular") restored = true;
      if (body.status !== undefined) status = body.status;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "one",
            title: "Session One",
            status,
            pinned: false,
            created_at: "2026-07-14T10:00:00.000Z",
            updated_at: "2026-07-14T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  const link = page.getByRole("link", { name: /Session One/ }).first();
  await link.hover();
  await page.getByLabel("Session actions").first().click();
  await page.getByText("Restaurer").click();
  expect(restored).toBe(true);
});

test("copies and exports an assistant message", async ({ page }) => {
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  const assistant = page.locator("#message-one-assistant");
  await expect(assistant.getByText("one message answer")).toBeVisible();
  await assistant.getByLabel("Copy message").click();
  await expect(page.getByText("Message copied.")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe(
    "one message answer",
  );

  const downloadPromise = page.waitForEvent("download");
  await assistant.getByLabel("Export message as Markdown").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^message-.*\.md$/);
});

test("renders multi-tool success and tool-error from a stream", async ({ page }) => {
  let streamed = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      streamed = true;
      await fulfillChatStream({
        route,
        messageId: "tools-assistant",
        text: "Mixed tools done",
        body: multiToolStream({ messageId: "tools-assistant" }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/one/messages") {
      const base = conversationPayload({ id: "one", text: "one message" });
      const baseMessages = base.messages.map((message) =>
        message.role === "assistant"
          ? { ...message, parts: [{ type: "text", text: "one message answer" }] }
          : message,
      );
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...base,
          messages: streamed
            ? [
                ...baseMessages,
                {
                  id: "tools-user",
                  conversationId: "one",
                  parentId: null,
                  role: "user",
                  parts: [{ type: "text", text: "Run tools" }],
                  createdAt: "2026-07-20T00:00:00.000Z",
                },
                {
                  id: "tools-assistant",
                  conversationId: "one",
                  parentId: null,
                  role: "assistant",
                  parts: [
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
                  createdAt: "2026-07-20T00:00:01.000Z",
                },
              ]
            : baseMessages,
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Message input").fill("Run tools");
  await page.getByLabel("Send message").click();

  const toolsMessage = page.locator("#message-tools-assistant");
  await expect(toolsMessage.getByText("get recovery")).toBeVisible();
  await expect(toolsMessage.getByText("query database")).toBeVisible();
  await expect(toolsMessage.getByText("Completed")).toBeVisible();
  await expect(toolsMessage.getByText("Failed")).toBeVisible();
  await expect(toolsMessage.getByText("Mixed tools done")).toBeVisible();
});
