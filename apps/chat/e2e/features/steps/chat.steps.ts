import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import {
  assistantStream,
  conversationPayload,
  createMockApi,
  fulfillMockApi,
  openMockedChat,
  setTestSettings,
} from "../../mock/install.ts";

const { Given, When, Then } = createBdd();

Given("a user is on the chat page with suggestions", async ({ page }) => {
  const { app } = createMockApi({
    state: { suggestions: ["Tell me about recovery"] },
  });
  let generated = false;
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...payload,
          messages: generated
            ? [
                ...payload.messages,
                {
                  id: "suggestion-user",
                  conversationId: "one",
                  parentId: null,
                  role: "user",
                  parts: [{ type: "text", text: "Tell me about recovery" }],
                  createdAt: "2026-07-14T10:02:00.000Z",
                },
                {
                  id: "suggestion-assistant",
                  conversationId: "one",
                  parentId: null,
                  role: "assistant",
                  parts: [{ type: "text", text: "Recovery looks good" }],
                  createdAt: "2026-07-14T10:02:01.000Z",
                },
              ]
            : payload.messages,
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      generated = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "one",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: "suggestion-assistant", text: "Recovery looks good" }),
      });
      return;
    }
    await fulfillMockApi({ route, app });
  });
  await page.goto("/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on a new chat page", async ({ page }) => {
  await openMockedChat(page, "/chat");
});

When("they click the suggestion {string}", async ({ page }, suggestion: string) => {
  await page.getByRole("button", { name: suggestion }).click();
});

When("they click the Coach button", async ({ page }) => {
  await page.getByRole("button", { name: /Coach/ }).click();
});

Then("the message {string} should be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text).first()).toBeVisible();
});

Then("the assistant reply {string} should be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("the URL should include {string}", async ({ page }, fragment: string) => {
  await expect(page).toHaveURL(new RegExp(fragment));
});
