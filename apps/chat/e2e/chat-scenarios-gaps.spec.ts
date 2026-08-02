import { expect, test } from "@playwright/test";
import { type MockMessage, sessionOneSnapshot } from "./mock/app.ts";
import { createChatMock } from "./mock/install.ts";
import { openSessionActions } from "./open-session-actions.ts";

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

test("saves and removes an assistant message memory", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");

  const assistant = page.locator("#message-one-assistant");
  await assistant.getByLabel("Save message to memory").click();
  await expect(page.getByText("Saved 1 memory.")).toBeVisible();
  await expect(assistant.getByLabel("Remove message memories")).toBeVisible();

  await assistant.getByLabel("Remove message memories").click();
  await expect(page.getByText("Removed message memories.")).toBeVisible();
  await expect(assistant.getByLabel("Save message to memory")).toBeVisible();
});

test("renames, pins, and focuses branches", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot({ threads: [branchA, branchB] }) } },
  });
  await mock.open(page, "/chat/one");

  await page.getByRole("button", { name: "Branch B", exact: true }).click();
  await page.getByRole("button", { name: "Branch A", exact: true }).click();

  await page.getByRole("button", { name: "Actions for Branch A" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Branch title").fill("Renamed Branch");
  await page.getByRole("button", { name: "Save branch title" }).click();
  await expect(page.getByRole("button", { name: "Renamed Branch", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Renamed Branch" }).click();
  await page.getByRole("menuitem", { name: "Pin" }).click();
  expect(mock.state.snapshots.one?.threads.find((thread) => thread.id === "branch-a")?.pinned).toBe(
    true,
  );
});

test("renames a session from the header and cancels rename", async ({ page }) => {
  const mock = createChatMock({
    state: {
      conversations: [
        {
          id: "one",
          title: "Session One",
          status: "regular",
          pinned: false,
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T12:00:00.000Z",
        },
      ],
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");

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
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
    extend: (app, state) => {
      app.get("/api/conversations", (context) => {
        listCalls += 1;
        const search = context.req.query("search")?.trim().toLowerCase() ?? "";
        const list =
          search === ""
            ? state.conversations
            : state.conversations.filter((conversation) =>
                (conversation.title ?? "").toLowerCase().includes(search),
              );
        return context.json({ conversations: list });
      });
    },
  });
  await mock.open(page, "/chat/one");

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
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");

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
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { failStatus: 500 },
    },
  });
  await mock.open(page, "/chat/one");

  await page.getByLabel("Message input").fill("Please fail");
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Retry this request")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry this request" })).toBeVisible();
});

test("shows failure toasts for compact and conversation copy", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      compact: { failStatus: 500 },
    },
  });
  await mock.open(page, "/chat/one");

  await page.getByLabel("Compact conversation and start fresh").click();
  await expect(page.getByRole("alert").getByText("Could not compact conversation.")).toBeVisible();

  await page.context().grantPermissions([]);
  await page.getByLabel("Copy conversation as Markdown").click();
  await expect(page.getByRole("alert").getByText("Could not copy conversation.")).toBeVisible();
});

test("renders reasoning parts and message reference links", async ({ page }) => {
  const messages: MockMessage[] = [
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
  ];
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot({ messages }) } },
  });
  await mock.open(page, "/chat/one");

  await page.getByText("Reasoning").click();
  await expect(page.getByText("Thinking about recovery metrics.")).toBeVisible();
  await expect(page.getByText("Referenced message")).toBeVisible();
  await page.getByText("Referenced message").click();
  await expect(page.locator("#message-one-user")).toBeInViewport();
});

test("blocks empty send and allows file-only send", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Got the file" },
    },
  });
  await mock.open(page, "/chat/one");

  await page.getByLabel("Send message").click();
  expect(mock.state.chat.calls).toBe(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "solo.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Got the file")).toBeVisible();
  expect(mock.state.chat.calls).toBe(1);
  const parts = mock.state.chat.lastBody?.messages?.[0]?.parts ?? [];
  expect(parts.some((part) => part.type === "file")).toBe(true);
  expect(parts.some((part) => part.type === "text")).toBe(false);
});

test("unpins, cancels delete, and starts a new chat from the header", async ({ page }) => {
  const mock = createChatMock({
    state: {
      conversations: [
        {
          id: "one",
          title: "Session One",
          status: "regular",
          pinned: true,
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T12:00:00.000Z",
        },
      ],
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");

  await openSessionActions(page);
  await page.getByText("Désépingler").click();
  expect(mock.state.conversations[0]?.pinned).toBe(false);

  await openSessionActions(page);
  await page.getByText("Supprimer", { exact: true }).click();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
  expect(mock.state.conversations).toHaveLength(1);

  await page.getByLabel("New chat").click();
  await expect(page).toHaveURL(/\/chat\/?$/);
});

test("shows Google auth denial and guest start failure", async ({ page }) => {
  const mock = createChatMock({
    state: { authSession: null, anonymousOk: false },
  });
  await mock.install(page);
  await page.goto("/auth?error=access_denied");
  await expect(page.getByRole("alert").getByText(/Google account is not approved/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByText("Guest session could not be started. Try again.")).toBeVisible();
});

test("continues with Google into chat when social sign-in succeeds", async ({ page }) => {
  const mock = createChatMock({
    state: { authSession: null, socialOk: true },
  });
  await mock.install(page);
  await page.goto("/auth?next=/chat");

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/chat\/?$/);
  await expect(page.getByLabel("Message input")).toBeVisible();
});

test("shares copies a session URL and downloads markdown from the sidebar", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one");
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

test("shares a session via navigator.share when available", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  await mock.open(page, "/chat/one", { share: "mock" });

  await openSessionActions(page);
  await page.getByText("Partager").click();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as Window & { emiShareCalls?: ShareData[] }).emiShareCalls?.length ?? 0,
      ),
    )
    .toBe(1);
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as Window & { emiShareCalls?: ShareData[] }).emiShareCalls?.[0]?.url ?? "",
      ),
    )
    .toContain("/chat/one");
});

test("fork failure does not create a branch", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      fork: { failStatus: 500 },
    },
  });
  await mock.open(page, "/chat/one");

  await page.locator("#message-one-assistant").getByLabel("Fork from message").click();
  await expect(page.getByText("Creating branch…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Branch", exact: true })).toHaveCount(0);
});
