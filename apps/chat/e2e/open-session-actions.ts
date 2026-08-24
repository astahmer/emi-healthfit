import { expect, type Page } from "@playwright/test";

export const openSessionActions = async (
  page: Page,
  { href = "/chat/one" }: { href?: string } = {},
) => {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ has: page.locator(`a[href="${href}"]`) })
    .first();
  await expect(item).toBeVisible();
  await item.hover();
  const actions = item.getByLabel("Session actions");
  await expect(actions).toBeVisible();
  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
};
