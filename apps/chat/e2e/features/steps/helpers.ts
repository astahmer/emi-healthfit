import type { Page, Route } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  assistantStream,
  conversationPayload,
  createMockApi,
  fulfillMockApi,
  openMockedChat,
  setTestSettings,
} from "../../mock/install.ts";

export const branchThread = {
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

export const fulfillChatStream = async ({
  route,
  messageId,
  text,
}: {
  route: Route;
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

export const openSessionOne = async (page: Page) => {
  await openMockedChat(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
};

export const openSessionOneWithChatPersistence = async ({
  page,
  replyText = "Mock answer",
}: {
  page: Page;
  replyText?: string;
}) => {
  let sent = false;
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      sent = true;
      await fulfillChatStream({ route, messageId: "persisted-assistant", text: replyText });
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
                  id: "persisted-user",
                  conversationId: "one",
                  parentId: null,
                  role: "user",
                  parts: [{ type: "text", text: "hello" }],
                  createdAt: "2026-07-20T00:00:00.000Z",
                },
                {
                  id: "persisted-assistant",
                  conversationId: "one",
                  parentId: null,
                  role: "assistant",
                  parts: [{ type: "text", text: replyText }],
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
  await expect(page.getByText("one message answer")).toBeVisible();
};

export { assistantStream, conversationPayload, createMockApi, fulfillMockApi, openMockedChat, setTestSettings };
