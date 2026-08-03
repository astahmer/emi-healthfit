import { expect, test } from "@playwright/test";

test.skip(process.env.HEALTHFIT_REAL_WORKER !== "1", "requires the real HealthFit Worker runner");

test("authenticates through the real HealthFit Worker and renders chat", async ({ page }) => {
  const sessionResponse = await page.request.get("/api/auth/get-session");
  expect(sessionResponse.status()).toBe(200);

  await page.goto("/auth?next=%2Fchat");
  const signInResponse = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/anonymous"),
  );
  await page.getByRole("button", { name: "Continue as guest" }).click();
  expect([200, 201]).toContain((await signInResponse).status());

  await expect(page).toHaveURL(/\/chat$/);
  const apiKeyInput = page.getByRole("textbox", { name: "OpenAI API key" });
  await expect(apiKeyInput).toBeVisible();
  await apiKeyInput.fill("smoke-test-key");
  await page.getByRole("button", { name: "Save key and start chatting" }).click();
  await expect(page.getByRole("textbox", { name: "Message input", exact: true })).toBeVisible();

  const conversationsResponse = await page.request.get("/api/conversations");
  expect(conversationsResponse.status()).toBe(200);
  expect((await conversationsResponse.json()).conversations).toEqual([]);
});
