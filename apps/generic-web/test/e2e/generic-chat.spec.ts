import { expect, test, type Page } from "@playwright/test";

import { createGenericE2eApi } from "./mock-api.ts";

const openGenericChat = async (page: Page) => {
  const api = createGenericE2eApi();
  await api.install(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
  return api;
};

test("bootstraps one anonymous session before protected API reads", async ({ page }) => {
  const api = await openGenericChat(page);

  await expect(page.getByText("Authentication required", { exact: true })).toHaveCount(0);
  expect(api.anonymousSessionCalls()).toBe(1);
  await expect(page.getByPlaceholder("Search chats")).toBeVisible();
});

test("sends a generic stream and surfaces the persisted conversation", async ({ page }) => {
  const api = await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Hello generic");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(
    page.getByTestId("messages").getByText("Hello generic", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename conversation" })).toBeVisible();
  expect(api.chatCalls()).toBe(1);
  expect(api.conversations[0]?.id).toBe("conversation-1");
});

test("opens a reusable branch from a persisted message", async ({ page }) => {
  await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Branch this chat");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Branch here", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Branch", exact: true })).toBeVisible();
});

test("queues and removes a follow-up while the generic stream is active", async ({ page }) => {
  const api = await openGenericChat(page);
  api.holdStream();

  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("First request");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop generation" })).toBeVisible();

  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Queued request");
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  await expect(page.getByText("Queued follow-ups", { exact: true })).toBeVisible();
  await expect(page.getByText("Queued request", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove queued follow-up" }).click();
  await expect(page.getByText("Queued request", { exact: true })).toHaveCount(0);

  api.releaseStream();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
});

test("creates and deletes a memory through the generic Worker contract", async ({ page }) => {
  await openGenericChat(page);

  await page.locator("summary").filter({ hasText: "Memories" }).click();
  await page.getByPlaceholder("Save a detail for future chats").fill("Prefers concise replies");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(page.getByText("Prefers concise replies", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Prefers concise replies", { exact: true })).toHaveCount(0);
});

test("renames, archives, clones, and deletes a generic conversation", async ({ page }) => {
  await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Conversation lifecycle");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  page.once("dialog", (dialog) => void dialog.accept("Renamed generic chat"));
  await page.getByRole("button", { name: "Rename conversation" }).click();
  await expect(page.getByText("Renamed generic chat", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Archive conversation" }).click();
  await expect(page.getByRole("button", { name: "Restore conversation" })).toBeVisible();
  await page.getByRole("button", { name: "Clone conversation" }).click();
  await expect(page.getByRole("button", { name: "Renamed generic chat", exact: true })).toHaveCount(
    2,
  );
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete conversation" }).first().click();
});

test("keeps attachment controls and supports file-only generic sends", async ({ page }) => {
  const api = await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("generic attachment"),
  });
  await expect(page.getByText("notes.txt", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /notes\.txt/ }).click();
  await expect(page.getByText("notes.txt", { exact: false })).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "recovery.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("send this file"),
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
  expect(api.chatCalls()).toBe(1);
  expect(api.lastChatBody()).toMatchObject({
    messages: [
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            filename: "recovery.txt",
            mediaType: "text/plain",
            type: "file",
          }),
        ]),
      }),
    ],
  });
});

test("rejects unsupported image attachments before sending", async ({ page }) => {
  const api = await openGenericChat(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "unsupported.bmp",
    mimeType: "image/bmp",
    buffer: Buffer.from("not a real bitmap"),
  });
  await expect(page.getByText(/unsupported image format/i)).toBeVisible();
  expect(api.chatCalls()).toBe(0);
});

test("switches theme and temporary chat from actor-backed settings", async ({ page }) => {
  await openGenericChat(page);

  await page.getByRole("combobox", { name: "Theme" }).click();
  await page.getByRole("option", { name: "Dark" }).click();
  await expect(page.locator("main")).toHaveClass(/dark/);

  await page.getByLabel("Temporary chat").check();
  await expect(page.getByText("Temporary", { exact: true }).first()).toBeVisible();
});
