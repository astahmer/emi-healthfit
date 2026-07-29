import { expect, test } from "@playwright/test";
import { createChatMock } from "./mock/install.ts";

test("shows the app version and update check in Settings", async ({ page }) => {
  const mock = createChatMock();
  await mock.open(page, "/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const about = page.getByRole("region", { name: "App version" });
  await about.scrollIntoViewIfNeeded();
  await expect(about.getByRole("heading", { name: "App version" })).toBeVisible();
  await expect(page.getByTestId("app-version-label")).toHaveText(/v\d+\.\d+\.\d+/);
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByTestId("app-update-status")).toBeVisible();
});
