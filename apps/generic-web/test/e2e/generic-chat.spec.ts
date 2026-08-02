import { expect, test, type Page } from "@playwright/test";

import { createGenericE2eApi } from "./mock-api.ts";

const openGenericChat = async (page: Page) => {
  const api = createGenericE2eApi();
  await api.install(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
  return api;
};

test("boots the documented runtime/provider/recipe path", async ({ page }) => {
  const api = await openGenericChat(page);

  await expect(page.getByText("Search conversations", { exact: true })).toBeVisible();
  await expect(page.getByText("Memories", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Theme")).toBeVisible();
  await expect(page.getByLabel("Add attachments")).toBeAttached();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(page.getByText("Authentication required", { exact: true })).toHaveCount(0);
  expect(api.anonymousSessionCalls()).toBe(1);
});

test("sends a protocol message through the actor runtime and renders the stream", async ({
  page,
}) => {
  const api = await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Hello generic");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(
    page.getByTestId("messages").getByText("Hello generic", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Conversation history").locator("article")).toHaveCount(1);
  expect(api.chatCalls()).toBe(1);
  expect(api.lastChatBody()).toMatchObject({
    messages: [expect.objectContaining({ role: "user" })],
  });
});

test("shows provider-neutral suggestions and sends a selected suggestion", async ({ page }) => {
  const api = await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Explain this");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByRole("button", { name: "Tell me more", exact: true })).toBeVisible();
  expect(api.suggestionsCalls()).toBe(1);
  expect(api.lastSuggestionsBody()).toMatchObject({ lastAssistantText: expect.any(String) });

  await page.getByRole("button", { name: "Tell me more", exact: true }).click();
  await expect(
    page.getByTestId("messages").getByText("Tell me more", { exact: true }),
  ).toBeVisible();
  expect(api.chatCalls()).toBe(2);
});

test("sends the web-search capability through the generic chat contract", async ({ page }) => {
  const api = await openGenericChat(page);

  await expect(page.getByRole("button", { name: "Web search", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Web search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Web search", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Search this");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
  expect(api.lastChatBody()).toMatchObject({ webSearch: true });
});

test("reports a failed social sign-in flow", async ({ page }) => {
  const api = createGenericE2eApi({ socialOk: false });
  await api.install(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Sign-in could not be started. Try again.");
  expect(api.socialAuthCalls()).toBe(1);
});

test("starts the successful social sign-in redirect flow", async ({ page }) => {
  const api = createGenericE2eApi();
  await api.install(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page).toHaveURL(/\/oauth-callback$/);
  expect(api.socialAuthCalls()).toBe(1);
});
