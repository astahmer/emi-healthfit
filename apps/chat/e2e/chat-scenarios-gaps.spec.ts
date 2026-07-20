import { expect, test, type Page } from "@playwright/test";
import {
  assistantStream,
  authSessionBody,
  conversationPayload,
  fulfillMockApi,
  openMockedChat,
  setTestSettings,
} from "./mock/install.ts";

const branchA = {
  id: "branch-a",
  conversation_id: "one",
  anchor_message_id: "one-assistant",
  title: "Branch A",
  status: "regular" as const,
  pinned: false,
  message_ids: ["one-user", "one-assistant"],
  created_at: "2026-07-14T10:02:00.000Z",
  updated_at: "2026-07-14T10:02:00.000Z",
};

const branchB = {
  ...branchA,
  id: "branch-b",
  title: "Branch B",
  message_ids: ["one-user", "one-assistant", "branch-b-user"],
  created_at: "2026-07-14T10:03:00.000Z",
  updated_at: "2026-07-14T10:03:00.000Z",
};

const fulfillChatStream = async ({
  route,
  messageId,
  text,
}: {
  route: Parameters<Parameters<Page["route"]>[1]>[0];
  messageId: string;
  text: string;
}) => {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-thread-id": "one",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body: assistantStream({ messageId, text }),
  });
};

const openSessionActions = async (page: Page) => {
  const link = page.getByRole("link", { name: /Session One|Renamed One|New chat/ }).first();
  await expect(link).toBeVisible();
  await link.hover();
  const actions = page.getByLabel("Session actions").first();
  await expect(actions).toBeVisible();
  await actions.click();
  await expect(
    page.getByText("Renommer").or(page.getByText("Archiver")).or(page.getByText("Restaurer")).or(page.getByText("Désépingler")).first(),
  ).toBeVisible();
};

test("saves and removes an assistant message memory", async ({ page }) => {
  let memories: Array<{
    id: string;
    content: string;
    source: string | null;
    thread_id: string | null;
    created_at: string;
  }> = [];

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/memories" && request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ memories }),
      });
      return;
    }
    if (url.pathname === "/api/memories/extract" && request.method() === "POST") {
      const body = request.postDataJSON() as { text: string; messageId?: string; threadId?: string };
      memories = [
        {
          id: "memory-1",
          content: body.text.slice(0, 80),
          source: body.messageId === undefined ? "manual" : `manual:${body.messageId}`,
          thread_id: body.threadId ?? null,
          created_at: "2026-07-20T00:00:00.000Z",
        },
      ];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ids: ["memory-1"], count: 1 }),
      });
      return;
    }
    if (
      request.method() === "DELETE" &&
      url.pathname === "/api/memories/message/one-assistant"
    ) {
      memories = [];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  const assistant = page.locator("#message-one-assistant");
  await assistant.getByLabel("Save message to memory").click();
  await expect(page.getByText("Saved 1 memory.")).toBeVisible();
  await expect(assistant.getByLabel("Remove message memories")).toBeVisible();

  await assistant.getByLabel("Remove message memories").click();
  await expect(page.getByText("Removed message memories.")).toBeVisible();
  await expect(assistant.getByLabel("Save message to memory")).toBeVisible();
});

test("renames, pins, and focuses branches", async ({ page }) => {
  let threads = [branchA, branchB];
  const patches: Array<{ title?: string; pinned?: boolean }> = [];

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...payload, threads }),
      });
      return;
    }
    if (request.method() === "PATCH" && url.pathname.startsWith("/api/threads/")) {
      const id = url.pathname.split("/").at(-1);
      const body = request.postDataJSON() as { title?: string; pinned?: boolean };
      patches.push(body);
      threads = threads.map((thread) =>
        thread.id === id ? { ...thread, ...body } : thread,
      );
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByRole("button", { name: "Branch B", exact: true }).click();
  await page.getByRole("button", { name: "Branch A", exact: true }).click();

  await page.getByRole("button", { name: "Actions for Branch A" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Branch title").fill("Renamed Branch");
  await page.getByRole("button", { name: "Save branch title" }).click();
  await expect(page.getByRole("button", { name: "Renamed Branch", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Renamed Branch" }).click();
  await page.getByRole("menuitem", { name: "Pin" }).click();
  expect(patches).toEqual(
    expect.arrayContaining([{ title: "Renamed Branch" }, { pinned: true }]),
  );
});

test("renames a session from the header and cancels rename", async ({ page }) => {
  let title = "Session One";

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
              title,
              status: "regular",
              pinned: false,
              created_at: "2026-07-14T10:00:00.000Z",
              updated_at: "2026-07-14T12:00:00.000Z",
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...payload,
          conversation: { ...payload.conversation, title },
        }),
      });
      return;
    }
    if (request.method() === "PATCH" && url.pathname === "/api/conversations/one/title") {
      title = (request.postDataJSON() as { title: string }).title;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Rename session").click();
  await page.getByLabel("Session title").fill("Should cancel");
  await page.getByLabel("Cancel rename").click();
  await expect(page.getByText("Session One").first()).toBeVisible();

  await page.getByLabel("Rename session").click();
  await page.getByLabel("Session title").fill("Header Renamed");
  await page.getByLabel("Save title").click();
  await expect(page.getByText("Header Renamed").first()).toBeVisible();
});

test("searches sessions, syncs, and exports diagnostics", async ({ page }) => {
  let listCalls = 0;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations" && request.method() === "GET") {
      listCalls += 1;
      const search = url.searchParams.get("search")?.toLowerCase() ?? "";
      const all = [
        {
          id: "one",
          title: "Session One",
          status: "regular",
          pinned: false,
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T12:00:00.000Z",
        },
        {
          id: "two",
          title: "Session Two",
          status: "regular",
          pinned: false,
          created_at: "2026-07-14T09:00:00.000Z",
          updated_at: "2026-07-14T11:00:00.000Z",
        },
      ];
      const conversations =
        search === ""
          ? all
          : all.filter((conversation) => conversation.title.toLowerCase().includes(search));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ conversations }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/one/diagnostics") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ schemaVersion: 1, conversationId: "one", events: [] }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Search sessions").fill("Two");
  await expect(page.getByRole("link", { name: /Session Two/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Session One/ })).toHaveCount(0);

  const beforeSync = listCalls;
  await page.getByLabel("Sync sessions").click();
  await expect.poll(() => listCalls).toBeGreaterThan(beforeSync);

  await page.getByLabel("Search sessions").fill("");
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
  await openSessionActions(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Exporter les diagnostics").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("one-diagnostics.json");
});

test("removes an attachment and rejects unsupported image types", async ({ page }) => {
  await openMockedChat(page, "/chat/one");

  await page.locator('input[type="file"]').setInputFiles({
    name: "progress.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
  await expect(page.getByText("progress.png")).toBeVisible();
  await page.getByLabel("Remove progress.png").click();
  await expect(page.getByText("progress.png")).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.bmp",
    mimeType: "image/bmp",
    buffer: Buffer.from("bitmap"),
  });
  await expect(page.getByText(/unsupported image format/i)).toBeVisible();
});

test("shows stream failure controls on the failed user turn", async ({ page }) => {
  let chatCalls = 0;
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      chatCalls += 1;
      if (chatCalls === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Upstream failed" }),
        });
        return;
      }
      await fulfillChatStream({ route, messageId: "retry-assistant", text: "Recovered reply" });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Message input").fill("Please fail");
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Retry this request")).toBeVisible();
  await expect(page.locator("#message-one-user, [id^='message-']").filter({ hasText: "Please fail" }).first()).toBeVisible();
});

test("shows failure toasts for compact and conversation copy", async ({ page }) => {
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/conversations/one/compact") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Compact failed" }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Compact conversation and start fresh").click();
  await expect(page.getByRole("alert").getByText("Could not compact conversation.")).toBeVisible();

  await page.context().grantPermissions([]);
  await page.getByLabel("Copy conversation as Markdown").click();
  await expect(
    page.getByRole("alert").getByText("Could not copy conversation."),
  ).toBeVisible();
});

test("renders reasoning parts and message reference links", async ({ page }) => {
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/conversations/one/messages") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: conversationPayload({ id: "one", text: "one message" }).conversation,
          messages: [
            {
              id: "one-user",
              conversationId: "one",
              parentId: null,
              role: "user",
              parts: [{ type: "text", text: "one message" }],
              createdAt: "2026-07-14T10:00:00.000Z",
            },
            {
              id: "one-assistant",
              conversationId: "one",
              parentId: null,
              role: "assistant",
              parts: [
                { type: "reasoning", text: "Thinking about recovery metrics." },
                {
                  type: "text",
                  text: 'See earlier turn <message id="one-user" /> for context.',
                },
              ],
              createdAt: "2026-07-14T10:01:00.000Z",
            },
          ],
          threads: [],
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByText("Reasoning").click();
  await expect(page.getByText("Thinking about recovery metrics.")).toBeVisible();
  await expect(page.getByText("Referenced message")).toBeVisible();
  await page.getByText("Referenced message").click();
  await expect(page.locator("#message-one-user")).toBeInViewport();
});

test("blocks empty send and allows file-only send", async ({ page }) => {
  let chatCalls = 0;
  let fileOnly = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      chatCalls += 1;
      const body = request.postDataJSON() as {
        messages?: Array<{ parts?: Array<{ type?: string; text?: string }> }>;
      };
      const parts = body.messages?.[0]?.parts ?? [];
      fileOnly = parts.some((part) => part.type === "file") && !parts.some((part) => part.type === "text");
      await fulfillChatStream({ route, messageId: "file-assistant", text: "Got the file" });
      return;
    }
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...payload,
          messages:
            chatCalls === 0
              ? payload.messages
              : [
                  ...payload.messages,
                  {
                    id: "file-user",
                    conversationId: "one",
                    parentId: null,
                    role: "user",
                    parts: [
                      {
                        type: "file",
                        filename: "solo.png",
                        mediaType: "image/png",
                        url: "data:image/png;base64,aW1hZ2U=",
                      },
                    ],
                    createdAt: "2026-07-20T00:00:00.000Z",
                  },
                  {
                    id: "file-assistant",
                    conversationId: "one",
                    parentId: null,
                    role: "assistant",
                    parts: [{ type: "text", text: "Got the file" }],
                    createdAt: "2026-07-20T00:00:01.000Z",
                  },
                ],
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Send message").click();
  expect(chatCalls).toBe(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "solo.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Got the file")).toBeVisible();
  expect(chatCalls).toBe(1);
  expect(fileOnly).toBe(true);
});

test("unpins, cancels delete, and starts a new chat from the header", async ({ page }) => {
  let pinned = true;
  let deleted = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversations: deleted
            ? []
            : [
                {
                  id: "one",
                  title: "Session One",
                  status: "regular",
                  pinned,
                  created_at: "2026-07-14T10:00:00.000Z",
                  updated_at: "2026-07-14T12:00:00.000Z",
                },
              ],
        }),
      });
      return;
    }
    if (request.method() === "PATCH" && url.pathname === "/api/conversations/one") {
      const body = request.postDataJSON() as { pinned?: boolean };
      if (body.pinned !== undefined) pinned = body.pinned;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "one",
            title: "Session One",
            status: "regular",
            pinned,
            created_at: "2026-07-14T10:00:00.000Z",
            updated_at: "2026-07-14T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    if (request.method() === "DELETE" && url.pathname === "/api/conversations/one") {
      deleted = true;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await openSessionActions(page);
  await page.getByText("Désépingler").click();
  expect(pinned).toBe(false);

  await openSessionActions(page);
  await page.getByText("Supprimer", { exact: true }).click();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
  expect(deleted).toBe(false);

  await page.getByLabel("New chat").click();
  await expect(page).toHaveURL(/\/chat\/?$/);
});

test("shows Google auth denial and guest start failure", async ({ page }) => {
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/get-session") {
      await route.fulfill({ contentType: "application/json", body: "null" });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/auth?error=access_denied");
  await expect(
    page.getByRole("alert").getByText(/Google account is not approved/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

  await page.route("**/api/auth/sign-in/anonymous", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByText("Guest session could not be started. Try again.")).toBeVisible();
});

test("shares copies a session URL and downloads markdown from the sidebar", async ({ page }) => {
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await openSessionActions(page);
  await page.getByText("Partager").click();
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("/chat/one");

  await openSessionActions(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Télécharger").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/session-one\.md|conversation\.md/);
});

test("fork failure does not create a branch", async ({ page }) => {
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/conversations/one/threads") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fork failed" }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.locator("#message-one-assistant").getByLabel("Fork from message").click();
  await expect(page.getByText("Creating branch…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Branch", exact: true })).toHaveCount(0);
});
