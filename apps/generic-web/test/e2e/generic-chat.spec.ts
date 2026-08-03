import { expect, test } from "@playwright/test";

import { createGenericE2eApi } from "./mock-api.ts";
import { openGenericChat } from "./helpers.ts";
import { executeWebMcpTool, readWebMcpToolNames } from "./webmcp-harness.ts";

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

test("serves the WebMCP origin and permissions policy", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.headers()).toMatchObject({
    "origin-agent-cluster": "?1",
    "permissions-policy": "tools=(self)",
  });
});

test("shows and edits the merged memory summary alongside source memories", async ({ page }) => {
  await openGenericChat(page);

  await page.getByText("Memories", { exact: true }).click();
  await expect(page.getByLabel("Memory summary")).toHaveValue(
    "The user prefers concise worker answers.",
  );
  await page.getByLabel("Memory summary").fill("The user prefers edited worker answers.");
  await page.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(page.getByLabel("Memory summary")).toHaveValue(
    "The user prefers edited worker answers.",
  );
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

test("supports message revision and assistant retry through the core runtime", async ({ page }) => {
  const api = await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Original question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();

  const userMessage = page.getByTestId("messages").locator("[data-message-id]").first();
  await userMessage.getByRole("button", { name: "Edit message", exact: true }).click();
  await page.getByRole("textbox", { name: "Edit message", exact: true }).fill("Revised question");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(
    page.getByTestId("messages").getByText("Revised question", { exact: true }),
  ).toBeVisible();
  expect(api.lastChatBody()).toMatchObject({ replaceMessageId: expect.any(String) });

  const assistantMessage = page.getByTestId("messages").locator("[data-message-id]").last();
  await assistantMessage.getByRole("button", { name: "Retry message", exact: true }).click();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
  expect(api.chatCalls()).toBe(3);
});

test("supports queue, force-send, and branch/minimap controls", async ({ page }) => {
  const api = await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  api.holdStream();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("First question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop generation", exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Queued question");
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  await expect(page.getByText("Queued question", { exact: true })).toBeVisible();
  api.releaseStream();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Force send", exact: true }).click();
  await expect(
    page.getByTestId("messages").getByText("Queued question", { exact: true }),
  ).toBeVisible();
  expect(api.chatCalls()).toBe(2);

  const assistantMessage = page.getByTestId("messages").locator("[data-message-id]").last();
  await assistantMessage.getByRole("button", { name: "Branch here", exact: true }).click();
  await expect(page.getByText("Branches", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Branch", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "User message minimap" })).toBeVisible();
});

test("keeps temporary conversations out of durable history", async ({ page }) => {
  const api = await openGenericChat(page);

  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("checkbox", { name: "Temporary chat" }).check();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Temporary question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Conversation history").locator("article")).toHaveCount(0);
  expect(api.conversations).toHaveLength(0);
});

test("exposes conversation copy, download, and share controls", async ({ page }) => {
  await openGenericChat(page);

  await expect(page.getByRole("button", { name: "Copy conversation", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download conversation", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Share conversation", exact: true })).toBeVisible();
});

test("registers safe WebMCP tools and routes them through visible actor-owned state", async ({
  page,
}) => {
  const api = await openGenericChat(page, { webmcp: true });

  await expect
    .poll(() => readWebMcpToolNames(page))
    .toEqual([
      "fill_message_composer",
      "get_chat_context",
      "open_conversation",
      "search_conversations",
      "search_memories",
      "set_theme",
      "start_new_chat",
    ]);

  await page.getByLabel("API key").fill("sk-never-expose");
  const context = await executeWebMcpTool(page, "get_chat_context", {});
  expect(JSON.stringify(context)).not.toContain("sk-never-expose");
  expect(context).toMatchObject({
    ok: true,
    result: { capabilities: { searchMemories: true } },
  });

  await expect(
    executeWebMcpTool(page, "fill_message_composer", { text: "drafted by an agent" }),
  ).resolves.toMatchObject({ ok: true, result: { text: "drafted by an agent", sent: false } });
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(
    "drafted by an agent",
  );

  await expect(executeWebMcpTool(page, "set_theme", { theme: "dark" })).resolves.toEqual({
    ok: true,
    result: { theme: "dark" },
  });
  await expect(page.locator('[data-theme="dark"]')).toBeVisible();

  await expect(
    executeWebMcpTool(page, "search_memories", { query: "worker" }),
  ).resolves.toMatchObject({
    ok: true,
    result: { query: "worker", summary: { content: expect.any(String) } },
  });
  await expect(page.getByText("Memories", { exact: true })).toBeVisible();

  expect(api.chatCalls()).toBe(0);
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
