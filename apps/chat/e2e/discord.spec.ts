import { expect, test } from "@playwright/test";
import { createChatMock } from "./mock/install.ts";

test("generates and revokes a Discord link code from Settings", async ({ page }) => {
  const mock = createChatMock();
  await mock.open(page, "/settings");

  await expect(page.getByRole("heading", { name: "Discord bot" })).toBeVisible();
  await page.getByRole("button", { name: "Generate link code" }).click();

  await expect(page.getByText("ABCD0001")).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke" })).toBeVisible();
  expect(mock.state.discord.createCalls).toBe(1);
  expect(mock.state.discord.codes).toHaveLength(1);

  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  expect(mock.state.discord.codes).toHaveLength(0);
});

test("unlinks a Discord account from Settings", async ({ page }) => {
  const mock = createChatMock({
    state: {
      discord: {
        links: [{ discord_user_id: "discord-user-42", created_at: "2026-07-21T00:00:00.000Z" }],
        codes: [],
        createCalls: 0,
      },
    },
  });
  await mock.open(page, "/settings");

  await expect(page.getByText("discord-user-42")).toBeVisible();
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Unlink" }).click();
  await expect(page.getByText("discord-user-42")).toHaveCount(0);
  expect(mock.state.discord.links).toHaveLength(0);
});
