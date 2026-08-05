import { expect, test, type Page } from "@playwright/test";
import { type MockMessage, type MockSnapshot, createMockApi } from "./mock/app.ts";
import { createChatMock, openWithMock } from "./mock/install.ts";

const tallParagraph = (label: string) =>
  `${label}\n\n${Array.from({ length: 12 }, (_, index) => `Line ${index + 1} of ${label} with enough height for scrolling.`).join("\n")}`;

const tallConversationSnapshot = ({
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

const openTallChat = async ({ page, path }: { page: Page; path: string }) => {
  const mock = createMockApi({
    state: {
      snapshots: {
        one: tallConversationSnapshot({ id: "one", title: "Session One", turns: 10 }),
        two: tallConversationSnapshot({ id: "two", title: "Session Two", turns: 10 }),
      },
    },
  });
  await openWithMock({ page, app: mock.app, path });
  return mock;
};

const viewportMetrics = async (page: Page) => {
  const viewport = page.getByTestId("chat-thread-viewport");
  await expect(viewport).toBeVisible();
  return viewport.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    maxScrollTop: element.scrollHeight - element.clientHeight,
  }));
};

test("restores chat scroll position after refresh", async ({ page }) => {
  await openTallChat({ page, path: "/chat/one" });
  await expect(page.getByText("Session One assistant turn 9", { exact: true })).toBeVisible();

  const before = await viewportMetrics(page);
  expect(before.maxScrollTop).toBeGreaterThan(400);
  expect(before.scrollTop).toBeGreaterThan(before.maxScrollTop - 80);

  const targetScrollTop = Math.floor(before.maxScrollTop * 0.35);
  const storagePayload = JSON.stringify({
    "/chat/one": {
      '[data-scroll-restoration-id="chat-thread"]': {
        scrollX: 0,
        scrollY: targetScrollTop,
      },
    },
  });
  await page.getByTestId("chat-thread-viewport").evaluate(
    (element, { scrollTop, storageKey, payload }) => {
      element.scrollTop = scrollTop;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
      sessionStorage.setItem(storageKey, payload);
    },
    {
      scrollTop: targetScrollTop,
      storageKey: "tsr-scroll-restoration-v1_3",
      payload: storagePayload,
    },
  );

  await expect
    .poll(async () => (await viewportMetrics(page)).scrollTop)
    .toBeGreaterThan(targetScrollTop - 40);
  await expect
    .poll(async () => (await viewportMetrics(page)).scrollTop)
    .toBeLessThan(targetScrollTop + 40);

  await page.reload();
  await expect(page.getByText("Session One assistant turn 9", { exact: true })).toBeVisible();

  await expect
    .poll(async () => (await viewportMetrics(page)).scrollTop, { timeout: 10_000 })
    .toBeGreaterThan(targetScrollTop - 80);
  await expect
    .poll(async () => (await viewportMetrics(page)).scrollTop)
    .toBeLessThan(targetScrollTop + 80);
});

test("opens another session at the newest messages", async ({ page }) => {
  await openTallChat({ page, path: "/chat/one" });
  await expect(page.getByText("Session One assistant turn 9", { exact: true })).toBeVisible();

  await page.getByTestId("chat-thread-viewport").evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect.poll(async () => (await viewportMetrics(page)).scrollTop).toBeLessThan(40);

  await page.getByText("Session Two", { exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/two$/);
  await expect(page.getByText("Session Two assistant turn 9", { exact: true })).toBeVisible();

  const metrics = await viewportMetrics(page);
  expect(metrics.maxScrollTop).toBeGreaterThan(400);
  expect(metrics.scrollTop).toBeGreaterThan(metrics.maxScrollTop - 120);
});

test("message rail previews and jumps to a user message", async ({ page }) => {
  await openTallChat({ page, path: "/chat/one" });
  await expect(page.getByTestId("message-rail")).toBeVisible();

  const railItems = page.getByTestId("message-rail-item");
  await expect(railItems).toHaveCount(10);

  await railItems.nth(1).hover();
  const preview = page.getByTestId("message-rail-preview");
  await expect(preview).toContainText("Session One user turn 1");
  await expect(preview.locator("time")).toHaveAttribute("datetime", "2026-07-14T10:01:00.000Z");

  await page.mouse.move(600, 400);
  await expect(preview).toHaveCount(0);
  const railItemBox = await railItems.nth(1).boundingBox();
  expect(railItemBox).not.toBeNull();
  await page.mouse.move(railItemBox!.x + railItemBox!.width / 2, railItemBox!.y - 2);
  await expect(preview).toContainText("Session One user turn 1");
  await page.mouse.move(600, 400);
  await expect(preview).toHaveCount(0);
  await page.mouse.move(
    railItemBox!.x + railItemBox!.width + 8,
    railItemBox!.y + railItemBox!.height / 2,
  );
  await expect(preview).toContainText("Session One user turn 1");

  await railItems.nth(0).click();
  await expect.poll(async () => (await viewportMetrics(page)).scrollTop).toBeLessThan(200);

  await page.getByTestId("scroll-to-bottom").click();
  await expect
    .poll(async () => {
      const metrics = await viewportMetrics(page);
      return metrics.scrollTop > metrics.maxScrollTop - 120;
    })
    .toBe(true);
});

test("message rail sheet jumps to a user message on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTallChat({ page, path: "/chat/one" });
  await expect(page.getByTestId("message-rail-sheet-trigger")).toBeVisible();
  await expect(page.getByTestId("message-rail-item").first()).toBeHidden();

  await page.getByTestId("message-rail-sheet-trigger").click();
  const sheetItems = page.getByTestId("message-rail-sheet-item");
  await expect(sheetItems).toHaveCount(10);
  await expect(sheetItems.nth(1)).toContainText("Session One user turn 1");
  await expect(sheetItems.nth(1).locator("time")).toHaveAttribute(
    "datetime",
    "2026-07-14T10:01:00.000Z",
  );

  await sheetItems.nth(0).click();
  await expect.poll(async () => (await viewportMetrics(page)).scrollTop).toBeLessThan(200);
  await expect(page.getByTestId("message-rail-sheet")).toBeHidden();
});

test("scroll to previous user message jumps above the viewport", async ({ page }) => {
  await openTallChat({ page, path: "/chat/one" });
  await expect(page.getByText("Session One assistant turn 9", { exact: true })).toBeVisible();

  const before = await viewportMetrics(page);
  expect(before.scrollTop).toBeGreaterThan(before.maxScrollTop - 80);

  await expect(page.getByTestId("scroll-to-previous-user-message")).toBeVisible();
  await page.getByTestId("scroll-to-previous-user-message").click();

  await expect
    .poll(async () => {
      const metrics = await viewportMetrics(page);
      return metrics.scrollTop < before.scrollTop - 80;
    })
    .toBe(true);
});

test("scroll to oldest jumps to the top of the thread", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: {
        one: tallConversationSnapshot({ id: "one", title: "Session One", turns: 8 }),
      },
    },
  });
  await mock.open(page, "/chat/one");
  await expect(page.getByText("Session One assistant turn 7", { exact: true })).toBeVisible();

  await expect(page.getByTestId("scroll-to-top")).toBeVisible();
  await page.getByTestId("scroll-to-top").click();
  await expect.poll(async () => (await viewportMetrics(page)).scrollTop).toBeLessThan(40);
});
