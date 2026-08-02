import { expect, test } from "@playwright/test";

import { createGenericE2eApi } from "./mock-api.ts";

test("keeps the target recipe contained in the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await createGenericE2eApi().install(page);
  await page.goto("/");

  await expect(page.locator(".emi-chat-app")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
  await expect(page.locator(".emi-chat-app main")).toBeVisible();
});
