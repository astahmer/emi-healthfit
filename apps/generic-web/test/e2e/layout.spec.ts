import { expect, test } from "@playwright/test";

import { createGenericE2eApi } from "./mock-api.ts";

test("keeps desktop page contained while messages own scrolling", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await createGenericE2eApi().install(page);
  await page.goto("/");

  const metrics = await page.evaluate(() => {
    const messages = document.querySelector<HTMLElement>("[data-testid='messages']");
    return {
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: document.documentElement.clientHeight,
      messagesOverflow: messages === null ? null : getComputedStyle(messages).overflowY,
    };
  });

  expect(metrics.documentHeight).toBe(metrics.viewportHeight);
  expect(metrics.messagesOverflow).toBe("auto");
  await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("generic-desktop.png"), fullPage: false });
});

test("uses a keyboard-accessible mobile sidebar drawer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createGenericE2eApi().install(page);
  await page.goto("/");

  const closeSidebar = page.getByRole("button", { name: "Close chat sidebar" });
  expect(await closeSidebar.count()).toBe(1);
  await closeSidebar.click();
  await expect(page.getByRole("button", { name: "Open chat sidebar" })).toBeVisible();

  const openSidebar = page.getByRole("button", { name: "Open chat sidebar" });
  expect(await openSidebar.count()).toBe(1);
  await openSidebar.click();
  await expect(closeSidebar).toBeVisible();
  await expect(page.locator("[data-slot='sheet-content']")).toHaveCSS("transform", "none");

  const metrics = await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
  }));
  expect(metrics.documentHeight).toBe(metrics.viewportHeight);
  await page.screenshot({ path: testInfo.outputPath("generic-mobile.png"), fullPage: false });
});
