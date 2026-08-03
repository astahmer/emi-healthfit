import { expect, type Page } from "@playwright/test";

import { createGenericE2eApi } from "./mock-api.ts";
import { installWebMcpHarness } from "./webmcp-harness.ts";

export const openGenericChat = async (
  page: Page,
  { webmcp = false }: { webmcp?: boolean } = {},
) => {
  if (webmcp) await installWebMcpHarness(page);
  const api = createGenericE2eApi();
  await api.install(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
  return api;
};
