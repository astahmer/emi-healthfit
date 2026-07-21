import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { createChatMock, sessionOneSnapshot } from "../../mock/install.ts";
import { openMockedChat, openSessionOne, openSessionOneWithChatPersistence } from "./helpers.ts";

const { Given, When, Then } = createBdd();

Given("a user is on the chat page with suggestions", async ({ page }) => {
  const mock = createChatMock({
    state: {
      suggestions: ["Tell me about recovery"],
      chat: { persist: true, replyText: "Recovery looks good" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on a new chat page", async ({ page }) => {
  await openMockedChat(page, "/chat");
});

Given("a user is on session one", async ({ page }) => {
  await openSessionOne(page);
});

Given("a user is on session one with chat persistence", async ({ page }) => {
  await openSessionOneWithChatPersistence({ page, replyText: "Saw the image" });
});

Given(
  "a user is on session one that replies {string} to the next message",
  async ({ page }, replyText: string) => {
    await openSessionOneWithChatPersistence({ page, replyText });
  },
);

Given("a user starts a temporary chat", async ({ page }) => {
  const mock = createChatMock({
    state: { chat: { persist: true, replyText: "Ghost reply" } },
  });
  await mock.open(page, "/chat");
  await page.getByRole("button", { name: /Temporary/ }).click();
});

Given("a signed-out user is on the auth page", async ({ page }) => {
  const mock = createChatMock({ state: { authSession: null } });
  await mock.install(page);
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: /Your training history/ })).toBeVisible();
});

Given("a user has an archived session one", async ({ page }) => {
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
});

Given("a user is on a new chat page that creates conversations", async ({ page }) => {
  const mock = createChatMock({
    state: {
      createConversationId: "fresh",
      chat: { persist: true, replyText: "Hello back" },
      snapshots: {
        fresh: {
          conversation: {
            id: "fresh",
            title: null,
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:00.000Z",
          },
          messages: [],
          threads: [],
        },
      },
    },
  });
  await mock.open(page, "/chat");
});

When("they click the suggestion {string}", async ({ page }, suggestion: string) => {
  await page.getByRole("button", { name: suggestion }).click();
});

When("they click the Coach button", async ({ page }) => {
  await page.getByRole("button", { name: /Coach/ }).click();
});

When("they click the Temporary button", async ({ page }) => {
  await page.getByRole("button", { name: /Temporary/ }).click();
});

When("they click the Web button", async ({ page }) => {
  await page.getByRole("button", { name: /Web/ }).click();
});

When("they select the model {string}", async ({ page }, label: string) => {
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(`^${label}$`) }).click();
});

When("they send the message {string}", async ({ page }, text: string) => {
  await page.getByLabel("Message input").fill(text);
  await page.getByLabel("Send message").click();
});

When("they refresh the new chat page", async ({ page }) => {
  await page.goto("/chat");
});

When("they continue as guest", async ({ page }) => {
  await page.getByRole("button", { name: "Continue as guest" }).click();
});

When("they fork from the assistant message", async ({ page }) => {
  await page.locator("#message-one-assistant").getByLabel("Fork from message").click();
});

When("they compact the conversation", async ({ page }) => {
  await page.getByLabel("Compact conversation and start fresh").click();
});

When("they attach the image {string}", async ({ page }, filename: string) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
});

When("they restore the session from the sidebar", async ({ page }) => {
  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ hasText: /Session One/ })
    .first();
  await item.hover();
  await item.getByLabel("Session actions").click();
  await page.getByText("Restaurer").click();
});

When("they copy the assistant message", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#message-one-assistant").getByLabel("Copy message").click();
});

Then("the message {string} should be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text).first()).toBeVisible();
});

Then("the message {string} should not be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toHaveCount(0);
});

Then("the assistant reply {string} should be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("the URL should include {string}", async ({ page }, fragment: string) => {
  await expect(page).toHaveURL(new RegExp(fragment));
});

Then("the Temporary button should look active", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Temporary/ })).toHaveAttribute(
    "data-variant",
    "secondary",
  );
});

Then("the model combobox should show {string}", async ({ page }, label: string) => {
  await expect(page.getByRole("combobox")).toContainText(label);
});

Then("the chat composer should be visible", async ({ page }) => {
  await expect(page.getByLabel("Message input")).toBeVisible();
});

Then("the branch {string} should be visible", async ({ page }, title: string) => {
  await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
});

Then("they should land on the compacted session", async ({ page }) => {
  await expect(page).toHaveURL(/\/chat\/compacted/);
});

Then("the compacted context should show {string}", async ({ page }, text: string) => {
  await expect(page.getByLabel("Compacted context")).toBeVisible();
  await expect(page.getByText(text)).toBeVisible();
});

Then("the attachment preview {string} should be visible", async ({ page }, filename: string) => {
  await expect(page.getByText(filename)).toBeVisible();
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible();
});

Then("the session should no longer be archived", async ({ page }) => {
  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ hasText: /Session One/ })
    .first();
  await item.hover();
  await item.getByLabel("Session actions").click();
  await expect(page.getByText("Archiver")).toBeVisible();
});

Then("they should see the status {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});
