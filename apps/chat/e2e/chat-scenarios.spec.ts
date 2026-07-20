import { expect, test, type Page } from "@playwright/test";
import {
  assistantStream,
  conversationPayload,
  createMockApi,
  fulfillMockApi,
  openMockedChat,
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

test("clicks a follow-up suggestion and shows the sent message", async ({ page }) => {
  const { app } = createMockApi({
    state: { suggestions: ["Tell me about recovery"] },
  });
  let generated = false;

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
          messages: generated
            ? [
                ...payload.messages,
                {
                  id: "suggestion-user",
                  conversationId: "one",
                  parentId: null,
                  role: "user",
                  parts: [{ type: "text", text: "Tell me about recovery" }],
                  createdAt: "2026-07-14T10:02:00.000Z",
                },
                {
                  id: "suggestion-assistant",
                  conversationId: "one",
                  parentId: null,
                  role: "assistant",
                  parts: [{ type: "text", text: "Recovery looks good" }],
                  createdAt: "2026-07-14T10:02:01.000Z",
                },
              ]
            : payload.messages,
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      generated = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "one",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: "suggestion-assistant", text: "Recovery looks good" }),
      });
      return;
    }
    await fulfillMockApi({ route, app });
  });
  await page.goto("/chat/one");

  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tell me about recovery" })).toBeVisible();
  await page.getByRole("button", { name: "Tell me about recovery" }).click();

  await expect(page.getByText("Recovery looks good")).toBeVisible();
});

test("stops a mid-stream generation", async ({ page }) => {
  const hold = holdableStream();
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      await hold.gate;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "one",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: "stopped-assistant", text: "Should not appear" }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.getByLabel("Message input").fill("Please stop me");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();
  await page.getByLabel("Stop generating").click();
  hold.release();

  await expect(page.getByLabel("Send message")).toBeVisible();
  await expect(page.getByText("Should not appear")).toHaveCount(0);
});

test("edits a user message and regenerates an assistant reply", async ({ page }) => {
  let chatCalls = 0;
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname.includes("/messages/")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/one/messages") {
      const assistantText =
        chatCalls >= 2 ? "Regenerated answer" : chatCalls === 1 ? "Edited answer" : "one message answer";
      const userText = chatCalls >= 1 ? "Edited question" : "one message";
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
              parts: [{ type: "text", text: userText }],
              createdAt: "2026-07-14T10:00:00.000Z",
            },
            {
              id: chatCalls >= 2 ? "edit-2" : chatCalls === 1 ? "edit-1" : "one-assistant",
              conversationId: "one",
              parentId: null,
              role: "assistant",
              parts: [{ type: "text", text: assistantText }],
              createdAt: "2026-07-14T10:01:00.000Z",
            },
          ],
          threads: [],
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      chatCalls += 1;
      const text = chatCalls === 1 ? "Edited answer" : "Regenerated answer";
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "one",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: `edit-${chatCalls}`, text }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await expect(page.getByText("one message", { exact: true })).toBeVisible();
  await page.getByLabel("Edit message").first().click();
  await page.getByRole("textbox", { name: "Edit message" }).fill("Edited question");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Edited answer")).toBeVisible();

  await page.getByLabel("Regenerate response").click();
  await expect(page.getByText("Regenerated answer")).toBeVisible();
});

test("forks a branch from an assistant message", async ({ page }) => {
  let forked = false;
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/conversations/one/threads") {
      forked = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(branchThread),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

  await page.locator("#message-one-assistant").getByLabel("Fork from message").click();
  await expect(page.getByRole("button", { name: "Branch", exact: true })).toBeVisible();
  expect(forked).toBe(true);
});

test("searches within a conversation that has branches", async ({ page }) => {
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...payload, threads: [branchThread] }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");

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

const openSessionActions = async (page: Page) => {
  const link = page.getByRole("link", { name: /Session One|Renamed One|New chat/ }).first();
  await link.hover();
  await page.getByLabel("Session actions").first().click();
};

test("renames, pins, archives, clones, copies, shares, and deletes from the sidebar", async ({
  page,
}) => {
  const mutations: string[] = [];
  let title = "Session One";
  let pinned = false;
  let status: "regular" | "archived" = "regular";

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
              status,
              pinned,
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
          ],
        }),
      });
      return;
    }
    if (request.method() === "PATCH" && url.pathname === "/api/conversations/one/title") {
      mutations.push("rename");
      const body = request.postDataJSON() as { title: string };
      title = body.title;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    if (request.method() === "PATCH" && url.pathname === "/api/conversations/one") {
      mutations.push("state");
      const body = request.postDataJSON() as { pinned?: boolean; status?: "regular" | "archived" };
      if (body.pinned !== undefined) pinned = body.pinned;
      if (body.status !== undefined) status = body.status;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "one",
            title,
            status,
            pinned,
            created_at: "2026-07-14T10:00:00.000Z",
            updated_at: "2026-07-14T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/conversations/one/clone") {
      mutations.push("clone");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "cloned-one",
            title: `${title} (copy)`,
            status: "regular",
            pinned: false,
            created_at: "2026-07-14T12:00:00.000Z",
            updated_at: "2026-07-14T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    if (request.method() === "DELETE" && url.pathname === "/api/conversations/one") {
      mutations.push("delete");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/one/diagnostics") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ events: [] }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await openSessionActions(page);
  await page.getByText("Renommer").click();
  await page.getByRole("list").getByRole("textbox").fill("Renamed One");
  await page.getByRole("list").getByRole("textbox").press("Enter");
  await expect(page.getByText("Renamed One").first()).toBeVisible();

  await openSessionActions(page);
  await page.getByText("Épingler").click();
  expect(mutations).toContain("state");

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

  expect(mutations).toEqual(expect.arrayContaining(["rename", "state", "clone", "delete"]));
});
