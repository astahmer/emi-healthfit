import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

import { createGenericE2eApi } from "../../mock-api.ts";
import { executeWebMcpTool, readWebMcpToolNames } from "../../webmcp-harness.ts";
import { openGenericChat } from "../../helpers.ts";

const { Given, When, Then } = createBdd();

type GenericE2eApi = ReturnType<typeof createGenericE2eApi>;

type ScenarioState = {
  api: GenericE2eApi;
  apiKey?: string;
};

const stateByPage = new WeakMap<Page, ScenarioState>();

const getState = (page: Page): ScenarioState => {
  const state = stateByPage.get(page);
  if (state === undefined) throw new Error("Generic E2E scenario is not initialized");
  return state;
};

Given("a guest user is on the generic chat", async ({ page }) => {
  const api = await openGenericChat(page);
  stateByPage.set(page, { api });
});

Given("a guest user is on the generic chat with WebMCP enabled", async ({ page }) => {
  const api = await openGenericChat(page, { webmcp: true });
  stateByPage.set(page, { api });
});

When("they send {string} in the generic chat", async ({ page }, message: string) => {
  await page.getByLabel("API key").fill("sk-bdd");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
});

When("they open the Memories panel", async ({ page }) => {
  await page.getByText("Memories", { exact: true }).click();
});

When("they replace the memory summary with {string}", async ({ page }, content: string) => {
  await page.getByLabel("Memory summary").fill(content);
  await page.getByRole("button", { name: "Save summary", exact: true }).click();
});

When("they configure the API key {string}", async ({ page }, apiKey: string) => {
  getState(page).apiKey = apiKey;
  await page.getByLabel("API key").fill(apiKey);
});

When("an agent fills the composer with {string} through WebMCP", async ({ page }, text: string) => {
  await expect(executeWebMcpTool(page, "fill_message_composer", { text })).resolves.toMatchObject({
    ok: true,
    result: { text, sent: false },
  });
});

Then("the message {string} should be visible", async ({ page }, message: string) => {
  await expect(page.getByTestId("messages").getByText(message, { exact: true })).toBeVisible();
});

Then("the generic assistant reply {string} should be visible", async ({ page }, reply: string) => {
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
});

Then("the generic chat API should have received one request", ({ page }) => {
  expect(getState(page).api.chatCalls()).toBe(1);
});

Then("the memory summary should be {string}", async ({ page }, content: string) => {
  await expect(page.getByLabel("Memory summary")).toHaveValue(content);
});

Then("the WebMCP tool {string} should be registered", async ({ page }, toolName: string) => {
  await expect.poll(() => readWebMcpToolNames(page)).toContain(toolName);
});

Then("the WebMCP context should not expose the configured API key", async ({ page }) => {
  const apiKey = getState(page).apiKey;
  if (apiKey === undefined) throw new Error("WebMCP API key is not configured");
  const context = await executeWebMcpTool(page, "get_chat_context", {});
  expect(JSON.stringify(context)).not.toContain(apiKey);
});

Then("the message composer should contain {string}", async ({ page }, content: string) => {
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(content);
});
