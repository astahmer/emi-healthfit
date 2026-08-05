import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import type { Page } from "@playwright/test";
import { fixturePath } from "../../fixture-path.ts";

const { Given, When, Then } = createBdd();

const providerBaseUrl = "http://127.0.0.1:1399/v1";

const installRealWorkerSettings = (page: Page) =>
  page.addInitScript((baseUrl: string) => {
    localStorage.setItem(
      "emi-chat-settings",
      JSON.stringify({
        state: {
          settings: {
            provider: "openai",
            baseUrl,
            apiKey: "worker-test-key",
            model: "gpt-4o-mini",
            systemPrompt: "You are a test assistant.",
            coachMode: false,
          },
        },
        version: 0,
      }),
    );
  }, providerBaseUrl);

const signInAsGuest = async (page: Page) => {
  await page.goto("/auth?next=%2Fchat");
  await expect(page.getByRole("button", { name: "Continue as guest" })).toBeVisible();
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page).toHaveURL(/\/chat\/?$/);
  await expect(page.getByLabel("Message input")).toBeVisible();
};

Given("a real worker guest is on the chat page", async ({ page }) => {
  await installRealWorkerSettings(page);
  await signInAsGuest(page);
});

Given("a real worker guest is on the chat page with a conversation", async ({ page }) => {
  await installRealWorkerSettings(page);
  await signInAsGuest(page);
  await page.getByLabel("Message input").fill("Hello real worker");
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Real worker reply").first()).toBeVisible();
});

Given("a real worker guest is on the notes page", async ({ page }) => {
  await installRealWorkerSettings(page);
  await signInAsGuest(page);
  await page.goto("/notes");
});

When("they send the message {string} through the real worker", async ({ page }, text: string) => {
  await page.getByLabel("Message input").fill(text);
  await page.getByLabel("Send message").click();
});

When("they attach the photo {string} through the real worker", async ({ page }, name: string) => {
  await page.locator('input[type="file"]').setInputFiles(fixturePath(name));
  const basename = name.replace(/\.[^.]+$/, "");
  await expect(page.getByText(new RegExp(basename))).toBeVisible();
});

When("they reload the chat page", async ({ page }) => {
  await page.reload();
});

When("they reload the notes page", async ({ page }) => {
  await page.goto("/notes");
});

Then("the real worker conversation should be listed in the sidebar", async ({ page }) => {
  await expect(
    page.locator('[data-sidebar="menu-item"]').filter({ hasText: "Real worker reply" }).first(),
  ).toBeVisible();
});

Then("the real worker conversation should not be listed in the sidebar", async ({ page }) => {
  await expect(
    page.locator('[data-sidebar="menu-item"]').filter({ hasText: "Real worker reply" }),
  ).toHaveCount(0);
});

Then("the tool {string} should be displayed", async ({ page }, toolName: string) => {
  await expect(page.getByText(toolName).first()).toBeVisible();
});
