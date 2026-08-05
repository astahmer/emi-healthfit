import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  sessionOneSnapshot,
  type MockApi,
  type MockMessage,
  type MockSnapshot,
} from "../../mock/app.ts";
import { createChatMock, openMockedChat } from "../../mock/install.ts";

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

export const openSessionOne = async (page: Page): Promise<MockApi> => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
  return mock;
};

export const openSessionOneWithChatPersistence = async ({
  page,
  replyText = "Mock answer",
}: {
  page: Page;
  replyText?: string;
}): Promise<MockApi> => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText },
    },
  });
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
  return mock;
};

export const tallParagraph = (label: string) =>
  `${label}\n\n${Array.from({ length: 12 }, (_, index) => `Line ${index + 1} of ${label} with enough height for scrolling.`).join("\n")}`;

export const tallConversationSnapshot = ({
  id,
  title,
  turns,
}: {
  id: string;
  title: string;
  turns: number;
}): MockSnapshot => {
  const messages: MockMessage[] = [];
  for (let index = 0; index < turns; index += 1) {
    const userId = `${id}-user-${index}`;
    const assistantId = `${id}-assistant-${index}`;
    messages.push({
      id: userId,
      conversationId: id,
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: tallParagraph(`${title} user turn ${index}`) }],
      createdAt: `2026-07-14T10:${String(index).padStart(2, "0")}:00.000Z`,
    });
    messages.push({
      id: assistantId,
      conversationId: id,
      parentId: null,
      role: "assistant",
      parts: [{ type: "text", text: tallParagraph(`${title} assistant turn ${index}`) }],
      createdAt: `2026-07-14T10:${String(index).padStart(2, "0")}:30.000Z`,
    });
  }

  return {
    conversation: {
      id,
      title,
      status: "regular",
      pinned: false,
      created_at: "2026-07-14T10:00:00.000Z",
      updated_at: "2026-07-14T12:00:00.000Z",
    },
    messages,
    threads: [],
  };
};

export { createChatMock, openMockedChat, sessionOneSnapshot };
