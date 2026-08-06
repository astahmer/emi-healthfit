import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import type { Page } from "@playwright/test";
import { fixturePath } from "../../fixture-path.ts";
import { openSessionActions } from "../../open-session-actions.ts";

const { Given, When, Then } = createBdd();

const providerBaseUrl = "http://127.0.0.1:1399/v1";

const installRealWorkerSettings = (page: Page, tokenBudget?: number) =>
  page.addInitScript(
    ({ baseUrl, tokenBudget }) => {
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
              tokenBudget,
            },
          },
          version: 0,
        }),
      );
    },
    { baseUrl: providerBaseUrl, tokenBudget },
  );

const signInAsGuest = async (page: Page) => {
  await page.goto("/auth?next=%2Fchat");
  await expect(page.getByRole("button", { name: "Continue as guest" })).toBeVisible();
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page).toHaveURL(/\/chat\/?$/, { timeout: 15_000 });
  await expect(page.getByLabel("Message input")).toBeVisible();
};

Given("a real worker guest is on the chat page", async ({ page }) => {
  await installRealWorkerSettings(page);
  await signInAsGuest(page);
});

Given(
  "a real worker guest with a token budget of {int} is on the chat page",
  async ({ page }, budget: number) => {
    await installRealWorkerSettings(page, budget);
    await signInAsGuest(page);
  },
);

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
  await expect(page.getByText(new RegExp(basename)).first()).toBeVisible();
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
  ).toBeVisible({ timeout: 10_000 });
});

Then("the real worker conversation should not be listed in the sidebar", async ({ page }) => {
  await expect(
    page.locator('[data-sidebar="menu-item"]').filter({ hasText: "Real worker reply" }),
  ).toHaveCount(0);
});

Then("the tool {string} should be displayed", async ({ page }, toolName: string) => {
  await expect(page.getByText(toolName).first()).toBeVisible({ timeout: 10_000 });
});

Then("the photo {string} should be displayed in the chat", async ({ page }, name: string) => {
  await expect(page.getByAltText(name)).toBeVisible();
});

Then(
  "the assistant reply {string} should be displayed after the photo upload",
  async ({ page }, text: string) => {
    await expect(page.getByTestId("chat-thread-viewport").getByText(text).first()).toBeVisible({
      timeout: 20_000,
    });
  },
);

Then("{int} photos should be displayed in the chat", async ({ page }, count: number) => {
  await expect(page.locator('img[alt^="label-photo"]')).toHaveCount(count, { timeout: 10_000 });
});

Then("deleting the conversation removes its uploaded photos", async ({ page }) => {
  const src = await page.locator('img[alt^="label-photo"]').first().getAttribute("src");
  expect(src).toMatch(/^\/api\/attachments\//);
  await openSessionActions(page, { href: new URL(page.url()).pathname });
  await page.getByText("Supprimer", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page).toHaveURL(/\/chat\/?$/);
  await expect
    .poll(async () => (await page.request.get(src ?? "")).status(), { timeout: 10_000 })
    .toBe(404);
});

Then("the compacted summary block should contain {string}", async ({ page }, text: string) => {
  await expect(page.getByTestId("compacted-summary")).toContainText(text);
});
