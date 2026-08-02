import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { sessionOneSnapshot, type MockApi } from "../../mock/app.ts";
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

export { createChatMock, openMockedChat, sessionOneSnapshot };
