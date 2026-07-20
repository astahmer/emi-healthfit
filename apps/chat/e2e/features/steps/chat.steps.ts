import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import {
  authSessionBody,
  conversationPayload,
  createMockApi,
  fulfillMockApi,
  openMockedChat,
  setTestSettings,
} from "../../mock/install.ts";
import {
  branchThread,
  fulfillChatStream,
  openSessionOne,
  openSessionOneWithChatPersistence,
} from "./helpers.ts";

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
      await fulfillChatStream({
        route,
        messageId: "suggestion-assistant",
        text: "Recovery looks good",
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

Given("a user is on session one", async ({ page }) => {
  await openSessionOne(page);
});

Given("a user is on session one with chat persistence", async ({ page }) => {
  await openSessionOneWithChatPersistence({ page, replyText: "Saw the image" });
});

Given("a user starts a temporary chat", async ({ page }) => {
  let tempMessages: unknown[] = [];
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      url.pathname.startsWith("/api/conversations/temp_") &&
      url.pathname.endsWith("/messages")
    ) {
      const id = url.pathname.split("/")[3] ?? "temp";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id,
            title: null,
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:00.000Z",
          },
          messages: tempMessages,
          threads: [],
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      const body = request.postDataJSON() as {
        messages?: Array<{ parts?: Array<{ type?: string; text?: string }> }>;
      };
      const userText =
        body.messages?.[0]?.parts?.find((part) => part.type === "text")?.text ?? "Ghost note";
      tempMessages = [
        {
          id: "temp-user",
          conversationId: "temp",
          parentId: null,
          role: "user",
          parts: [{ type: "text", text: userText }],
          createdAt: "2026-07-20T00:00:00.000Z",
        },
        {
          id: "temp-assistant",
          conversationId: "temp",
          parentId: null,
          role: "assistant",
          parts: [{ type: "text", text: "Ghost reply" }],
          createdAt: "2026-07-20T00:00:01.000Z",
        },
      ];
      await fulfillChatStream({ route, messageId: "temp-assistant", text: "Ghost reply" });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat");
  await page.getByRole("button", { name: /Temporary/ }).click();
});

Given("a signed-out user is on the auth page", async ({ page }) => {
  let signedIn = false;
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/get-session") {
      await route.fulfill({
        contentType: "application/json",
        body: signedIn ? JSON.stringify(authSessionBody) : "null",
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/auth/sign-in/anonymous") {
      signedIn = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: /Your training history/ })).toBeVisible();
});

Given("a user has an archived session one", async ({ page }) => {
  let status: "regular" | "archived" = "archived";
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversations: [
            {
              id: "one",
              title: "Session One",
              status,
              pinned: false,
              created_at: "2026-07-14T10:00:00.000Z",
              updated_at: "2026-07-14T12:00:00.000Z",
            },
          ],
        }),
      });
      return;
    }
    if (request.method() === "PATCH" && url.pathname === "/api/conversations/one") {
      const body = request.postDataJSON() as { status?: "regular" | "archived" };
      if (body.status !== undefined) status = body.status;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "one",
            title: "Session One",
            status,
            pinned: false,
            created_at: "2026-07-14T10:00:00.000Z",
            updated_at: "2026-07-14T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat/one");
  (page as { __archivedStatus?: () => string }).__archivedStatus = () => status;
});

Given("a user is on a new chat page that creates conversations", async ({ page }) => {
  let createdId: string | undefined;
  let messages: unknown[] = [];
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/conversations") {
      createdId = "fresh";
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: createdId }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/fresh/messages") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "fresh",
            title: null,
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:00.000Z",
          },
          messages,
          threads: [],
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      const body = request.postDataJSON() as {
        messages?: Array<{ parts?: Array<{ type?: string; text?: string }> }>;
      };
      const userText =
        body.messages?.[0]?.parts?.find((part) => part.type === "text")?.text ?? "First hello";
      messages = [
        {
          id: "fresh-user",
          conversationId: "fresh",
          parentId: null,
          role: "user",
          parts: [{ type: "text", text: userText }],
          createdAt: "2026-07-20T00:00:00.000Z",
        },
        {
          id: "fresh-assistant",
          conversationId: "fresh",
          parentId: null,
          role: "assistant",
          parts: [{ type: "text", text: "Hello back" }],
          createdAt: "2026-07-20T00:00:01.000Z",
        },
      ];
      await fulfillChatStream({ route, messageId: "fresh-assistant", text: "Hello back" });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.goto("/chat");
});

When("they click the suggestion {string}", async ({ page }, suggestion: string) => {
  await page.getByRole("button", { name: suggestion }).click();
});

When("they click the Coach button", async ({ page }) => {
  await page.getByRole("button", { name: /Coach/ }).click();
});

When("they click the Temporary button", async ({ page }) => {
  await page.getByRole("button", { name: /Temporary/ }).click();
});

When("they click the Web button", async ({ page }) => {
  await page.getByRole("button", { name: /Web/ }).click();
});

When("they select the model {string}", async ({ page }, label: string) => {
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(`^${label}$`) }).click();
});

When("they send the message {string}", async ({ page }, text: string) => {
  await page.getByLabel("Message input").fill(text);
  await page.getByLabel("Send message").click();
});

When("they refresh the new chat page", async ({ page }) => {
  await page.goto("/chat");
});

When("they continue as guest", async ({ page }) => {
  await page.getByRole("button", { name: "Continue as guest" }).click();
});

When("they fork from the assistant message", async ({ page }) => {
  await page.route("**/api/conversations/one/threads", async (route) => {
    if (route.request().method() !== "POST") {
      await fulfillMockApi({ route });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(branchThread),
    });
  });
  await page.locator("#message-one-assistant").getByLabel("Fork from message").click();
});

When("they compact the conversation", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/conversations/one/compact") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "compacted",
            title: "Session One (compacted)",
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T12:00:00.000Z",
            updated_at: "2026-07-20T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/compacted/messages") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "compacted",
            title: "Session One (compacted)",
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T12:00:00.000Z",
            updated_at: "2026-07-20T12:00:00.000Z",
          },
          messages: [
            {
              id: "summary-1",
              conversationId: "compacted",
              parentId: null,
              role: "summary",
              parts: [
                {
                  type: "text",
                  text: "Use this compacted summary of the previous conversation as context:\nPrior workout notes.",
                },
              ],
              createdAt: "2026-07-20T12:00:00.000Z",
            },
          ],
          threads: [],
        }),
      });
      return;
    }
    await fulfillMockApi({ route });
  });
  await page.getByLabel("Compact conversation and start fresh").click();
});

When("they attach the image {string}", async ({ page }, filename: string) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
});

When("they restore the session from the sidebar", async ({ page }) => {
  const link = page.getByRole("link", { name: /Session One/ }).first();
  await link.hover();
  await page.getByLabel("Session actions").first().click();
  await page.getByText("Restaurer").click();
});

When("they copy the assistant message", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#message-one-assistant").getByLabel("Copy message").click();
});

Then("the message {string} should be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text).first()).toBeVisible();
});

Then("the message {string} should not be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toHaveCount(0);
});

Then("the assistant reply {string} should be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("the URL should include {string}", async ({ page }, fragment: string) => {
  await expect(page).toHaveURL(new RegExp(fragment));
});

Then("the Temporary button should look active", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Temporary/ })).toHaveAttribute(
    "data-variant",
    "secondary",
  );
});

Then("the model combobox should show {string}", async ({ page }, label: string) => {
  await expect(page.getByRole("combobox")).toContainText(label);
});

Then("the chat composer should be visible", async ({ page }) => {
  await expect(page.getByLabel("Message input")).toBeVisible();
});

Then("the branch {string} should be visible", async ({ page }, title: string) => {
  await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
});

Then("they should land on the compacted session", async ({ page }) => {
  await expect(page).toHaveURL(/\/chat\/compacted/);
});

Then("the compacted context should show {string}", async ({ page }, text: string) => {
  await expect(page.getByLabel("Compacted context")).toBeVisible();
  await expect(page.getByText(text)).toBeVisible();
});

Then("the attachment preview {string} should be visible", async ({ page }, filename: string) => {
  await expect(page.getByText(filename)).toBeVisible();
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible();
});

Then("the session should no longer be archived", async ({ page }) => {
  const link = page.getByRole("link", { name: /Session One/ }).first();
  await link.hover();
  await page.getByLabel("Session actions").first().click();
  await expect(page.getByText("Archiver")).toBeVisible();
});

Then("they should see the status {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});
