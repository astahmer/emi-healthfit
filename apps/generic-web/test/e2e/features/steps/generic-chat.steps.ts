import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

import { createGenericE2eApi } from "../../mock-api.ts";

const { Given, When, Then } = createBdd();

type GenericScenario = {
  api: ReturnType<typeof createGenericE2eApi>;
};

const scenarios = new WeakMap<Page, GenericScenario>();

const getScenario = (page: Page): GenericScenario => {
  const scenario = scenarios.get(page);
  if (scenario === undefined) throw new Error("Generic chat scenario is not initialized");
  return scenario;
};

const openGenericChat = async ({
  page,
  configured,
  holdStream,
}: {
  page: Page;
  configured?: boolean;
  holdStream?: boolean;
}) => {
  const api = createGenericE2eApi();
  if (holdStream === true) api.holdStream();
  await api.install(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
  if (configured === true) await page.getByLabel("API key").fill("sk-test");
  scenarios.set(page, { api });
};

Given("a new visitor opens generic chat", async ({ page }) => {
  await openGenericChat({ page });
});

Given("a configured visitor opens generic chat", async ({ page }) => {
  await openGenericChat({ configured: true, page });
});

Given("a configured visitor opens generic chat with a held stream", async ({ page }) => {
  await openGenericChat({ configured: true, holdStream: true, page });
});

When("they send the generic message {string}", async ({ page }, message: string) => {
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
});

When("they queue the generic follow-up {string}", async ({ page }, message: string) => {
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(message);
  await page.getByRole("button", { name: "Queue", exact: true }).click();
});

When("they remove the queued generic follow-up", async ({ page }) => {
  await page.getByRole("button", { name: "Remove queued follow-up", exact: true }).click();
});

When("they release the held generic stream", async ({ page }) => {
  getScenario(page).api.releaseStream();
});

When("they attach the text file {string}", async ({ page }, filename: string) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("generic bdd attachment"),
  });
});

When("they attach the unsupported image {string}", async ({ page }, filename: string) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "image/bmp",
    buffer: Buffer.from("unsupported generic bdd image"),
  });
});

When("they send the attachment", async ({ page }) => {
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
});

When("they rename the generic conversation to {string}", async ({ page }, title: string) => {
  page.once("dialog", (dialog) => void dialog.accept(title));
  await page.getByRole("button", { name: "Rename conversation", exact: true }).click();
});

When("they archive the generic conversation", async ({ page }) => {
  await page.getByRole("button", { name: "Archive conversation", exact: true }).click();
});

When("they restore the generic conversation", async ({ page }) => {
  await page.getByRole("button", { name: "Restore conversation", exact: true }).click();
});

When("they compact the generic conversation", async ({ page }) => {
  await page.getByRole("button", { name: "Compact conversation", exact: true }).click();
});

When("they copy the generic assistant message", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("messages").getByRole("button", { name: "Copy message" }).last().click();
});

When("they open the generic branch", async ({ page }) => {
  await page.getByRole("button", { name: "Branch here", exact: true }).last().click();
});

When("they open the generic memories panel", async ({ page }) => {
  await page.locator("summary").filter({ hasText: "Memories" }).click();
});

When("they save the memory {string}", async ({ page }, content: string) => {
  await page.getByPlaceholder("Save a detail for future chats").fill(content);
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
});

When("they delete the visible memory", async ({ page }) => {
  await page.getByRole("button", { name: "Delete", exact: true }).click();
});

When("they select the dark generic theme", async ({ page }) => {
  await page.getByRole("combobox", { name: "Theme" }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
});

When("they enable temporary generic chat", async ({ page }) => {
  await page.getByLabel("Temporary chat").check();
});

Then("the generic chat composer should be visible", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
});

Then("no authentication error should be visible", async ({ page }) => {
  await expect(page.getByText("Authentication required", { exact: true })).toHaveCount(0);
});

Then("the generic assistant reply should be visible", async ({ page }) => {
  await expect(page.getByText("Generic worker reply", { exact: true })).toBeVisible();
});

Then("the generic conversation should be visible in the sidebar", async ({ page }) => {
  await expect(
    page.getByLabel("Conversation history").getByRole("button", { name: "New chat", exact: true }),
  ).toBeVisible();
});

Then(
  "the queued generic follow-up {string} should be visible",
  async ({ page }, message: string) => {
    await expect(page.getByText(message, { exact: true })).toBeVisible();
  },
);

Then(
  "the queued generic follow-up {string} should not be visible",
  async ({ page }, message: string) => {
    await expect(page.getByText(message, { exact: true })).toHaveCount(0);
  },
);

Then("the attachment preview {string} should be visible", async ({ page }, filename: string) => {
  await expect(page.getByText(filename, { exact: false })).toBeVisible();
});

Then("the request should contain attachment {string}", async ({ page }, filename: string) => {
  await expect(getScenario(page).api.lastChatBody()).toMatchObject({
    messages: [
      expect.objectContaining({
        parts: expect.arrayContaining([expect.objectContaining({ filename, type: "file" })]),
      }),
    ],
  });
});

Then("the attachment validation error should be visible", async ({ page }) => {
  await expect(page.getByText(/unsupported image format/i)).toBeVisible();
});

Then("the generic conversation {string} should be visible", async ({ page }, title: string) => {
  await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
});

Then("the generic conversation should offer restore", async ({ page }) => {
  await expect(
    page.getByRole("button", { name: "Restore conversation", exact: true }),
  ).toBeVisible();
});

Then("the generic conversation should offer archive", async ({ page }) => {
  await expect(
    page.getByRole("button", { name: "Archive conversation", exact: true }),
  ).toBeVisible();
});

Then("the generic branch heading should be visible", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Branch", exact: true })).toBeVisible();
});

Then("the generic compact endpoint should be called", async ({ page }) => {
  await expect.poll(() => getScenario(page).api.compactCalls()).toBe(1);
});

Then("the generic message copied status should be visible", async ({ page }) => {
  await expect(page.getByText("Message copied.", { exact: true })).toBeVisible();
});

Then("the memory {string} should be visible", async ({ page }, content: string) => {
  await expect(page.getByText(content, { exact: true })).toBeVisible();
});

Then("the memory {string} should not be visible", async ({ page }, content: string) => {
  await expect(page.getByText(content, { exact: true })).toHaveCount(0);
});

Then("the generic chat should use the dark theme", async ({ page }) => {
  await expect(page.locator("main")).toHaveClass(/dark/);
});

Then("the temporary indicator should be visible", async ({ page }) => {
  await expect(page.getByText("Temporary", { exact: true }).first()).toBeVisible();
});
