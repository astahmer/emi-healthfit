import { expect, test } from "@playwright/test";

test.skip(process.env.GENERIC_REAL_WORKER !== "1", "requires the real generic Worker proxy");

test("boots authenticated chat through the real Worker and exposes safe app metadata", async ({
  page,
}) => {
  const healthResponse = await page.request.get("/api/health");
  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toEqual({
    name: process.env.GENERIC_EXPECTED_APP_NAME ?? "Core Chat",
  });

  const settingsResponse = await page.request.get("/api/settings");
  expect(await settingsResponse.json()).toEqual({
    apiKey: "browser-only",
    key: "emi-core-chat-settings",
    storage: "local",
  });

  const releasesResponse = await page.request.get("/api/releases");
  expect(await releasesResponse.json()).toEqual({
    releases: [
      {
        changes: ["Generic chat foundations are ready for application-specific extensions."],
        version: process.env.GENERIC_EXPECTED_APP_VERSION ?? "0.1.0",
      },
    ],
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
});

test("protects and answers attachment reads through the real Worker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
  const missing = await page.request.get("/api/attachments/not-a-real-object");
  expect(missing.status()).toBe(404);
});
