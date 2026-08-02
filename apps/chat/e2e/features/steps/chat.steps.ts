import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { sessionOneSnapshot } from "../../mock/app.ts";
import { createChatMock } from "../../mock/install.ts";
import { openMockedChat, openSessionOne, openSessionOneWithChatPersistence } from "./helpers.ts";

const { Given, When, Then } = createBdd();

type HeldGenerationScenario = {
  mock: ReturnType<typeof createChatMock>;
  replies: string[];
  secondPage?: Page;
};

const heldGenerationScenarios = new WeakMap<Page, HeldGenerationScenario>();

const getHeldGenerationScenario = (page: Page): HeldGenerationScenario => {
  const scenario = heldGenerationScenarios.get(page);
  if (scenario === undefined) throw new Error("Held generation scenario is not initialized");
  return scenario;
};

const openHeldGeneration = async (page: Page): Promise<HeldGenerationScenario> => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: { persist: true, replyText: "Live answer" },
    },
  });
  const replies = ["Live answer", "Follow-up answer", "Forced answer"];
  Object.defineProperty(mock.state.chat, "replyText", {
    configurable: true,
    get: () => replies[Math.max(0, mock.state.chat.calls - 1)] ?? "Mock answer",
    set: () => undefined,
  });
  mock.holdChat();
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();

  const scenario = { mock, replies };
  heldGenerationScenarios.set(page, scenario);
  return scenario;
};

const sendAndQueue = async ({
  page,
  message,
  queuedMessage,
}: {
  page: Page;
  message: string;
  queuedMessage: string;
}) => {
  await page.getByLabel("Message input").fill(message);
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();
  await page.getByLabel("Message input").fill(queuedMessage);
  await page.getByLabel("Send after reply").click();
};

Given("a user is on the chat page with suggestions", async ({ page }) => {
  const mock = createChatMock({
    state: {
      suggestions: ["Tell me about recovery"],
      chat: { persist: true, replyText: "Recovery looks good" },
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");
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

Given("a user is on session one with a held generation", async ({ page }) => {
  await openHeldGeneration(page);
});

Given("a user has a held generation with queued follow-ups in one tab", async ({ page }) => {
  await openHeldGeneration(page);
  await sendAndQueue({ page, message: "First question", queuedMessage: "Shared queue item" });
  await expect(page.getByLabel("Queued follow-ups")).toContainText("Shared queue item");
});

Given(
  "a user is on session one that replies {string} to the next message",
  async ({ page }, replyText: string) => {
    await openSessionOneWithChatPersistence({ page, replyText });
  },
);

Given("a user starts a temporary chat", async ({ page }) => {
  const mock = createChatMock({
    state: { chat: { persist: true, replyText: "Ghost reply" } },
  });
  await mock.open(page, "/chat");
  await page.getByRole("button", { name: /Temporary/ }).click();
});

Given("a signed-out user is on the auth page", async ({ page }) => {
  const mock = createChatMock({ state: { authSession: null } });
  await mock.install(page);
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: /Your training history/ })).toBeVisible();
});

Given("a user has an archived session one", async ({ page }) => {
  const mock = createChatMock({
    state: {
      conversations: [
        {
          id: "one",
          title: "Session One",
          status: "archived",
          pinned: false,
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T12:00:00.000Z",
        },
      ],
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  await mock.open(page, "/chat/one");
});

Given("a user is on a new chat page that creates conversations", async ({ page }) => {
  const mock = createChatMock({
    state: {
      createConversationId: "fresh",
      chat: { persist: true, replyText: "Hello back" },
      snapshots: {
        fresh: {
          conversation: {
            id: "fresh",
            title: null,
            status: "regular",
            pinned: false,
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:00.000Z",
          },
          messages: [],
          threads: [],
        },
      },
    },
  });
  await mock.open(page, "/chat");
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

When(
  "they send {string} and queue {string} before the reply finishes",
  async ({ page }, message: string, queuedMessage: string) => {
    await sendAndQueue({ page, message, queuedMessage });
    await expect(page.getByLabel("Queued follow-ups")).toContainText(queuedMessage);
    await expect(page.getByText("one message answer")).toBeVisible();
  },
);

When(
  "they queue multiple follow-ups, edit with arrow keys, cancel one, and force-send another",
  async ({ page }) => {
    const { replies } = getHeldGenerationScenario(page);
    await sendAndQueue({ page, message: "First question", queuedMessage: "Queue one" });
    await page.getByLabel("Message input").fill("Queue two");
    await page.getByLabel("Send after reply").click();
    await page.getByLabel("Message input").fill("Queue three");
    await page.getByLabel("Send after reply").click();

    const queue = page.getByLabel("Queued follow-ups");
    await page.getByLabel("Message input").press("ArrowUp");
    await expect(page.getByLabel("Message input")).toHaveValue("Queue three");
    await page.getByLabel("Message input").fill("Queue three edited");
    await page.getByLabel("Update queued message").click();
    await expect(queue).toContainText("Queue three edited");

    await page.getByLabel("Cancel queued message 2").click();
    await expect(queue).not.toContainText("Queue two");
    replies[1] = "Forced answer";
    await page.getByLabel("Send queued message 2 now").click();
  },
);

When("they open the same session in another tab", async ({ context, page }) => {
  const scenario = getHeldGenerationScenario(page);
  const secondPage = await context.newPage();
  await scenario.mock.install(secondPage);
  await secondPage.goto("/chat/one");
  await expect(secondPage.getByLabel("Queued follow-ups")).toContainText("Shared queue item");
  scenario.secondPage = secondPage;
});

When("they refresh the new chat page", async ({ page }) => {
  await page.goto("/chat");
});

When("they continue as guest", async ({ page }) => {
  await page.getByRole("button", { name: "Continue as guest" }).click();
});

When("they fork from the assistant message", async ({ page }) => {
  await page.locator("#message-one-assistant").getByLabel("Fork from message").click();
});

When("they compact the conversation", async ({ page }) => {
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
  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ hasText: /Session One/ })
    .first();
  await item.hover();
  await item.getByLabel("Session actions").click();
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

Then("the live assistant answer and both user turns should remain visible", async ({ page }) => {
  const { mock } = getHeldGenerationScenario(page);
  mock.releaseChat();
  await expect(
    page.locator('[id^="message-"]').filter({ hasText: "First question" }),
  ).toBeVisible();
  await expect(page.getByText("Live answer")).toBeVisible();
  await expect(
    page.locator('[id^="message-"]').filter({ hasText: "Second question" }),
  ).toBeVisible();
  await expect(page.getByText("Follow-up answer")).toBeVisible();
  await expect(page.getByText("one message answer")).toBeVisible();
  expect(mock.state.chat.calls).toBe(2);
});

Then(
  "the forced and remaining queued turns should appear without wiping prior history",
  async ({ page }) => {
    const { mock } = getHeldGenerationScenario(page);
    mock.releaseChat();
    await expect(
      page.locator('[id^="message-"]').filter({ hasText: "Queue three edited" }),
    ).toBeVisible();
    await expect(page.getByText("Forced answer").first()).toBeVisible();
    await expect(page.getByText("Queue two")).toHaveCount(0);
    await expect(page.getByText("one message answer")).toBeVisible();
  },
);

Then("they can see edit and cancel the shared queue", async ({ page }) => {
  const { mock, secondPage } = getHeldGenerationScenario(page);
  if (secondPage === undefined) throw new Error("Second tab is not initialized");
  await secondPage.getByLabel("Edit queued message 1").click();
  await expect(secondPage.getByLabel("Message input")).toHaveValue("Shared queue item");
  await secondPage.getByLabel("Message input").fill("Shared queue edited");
  await secondPage.getByLabel("Update queued message").click();
  await expect(page.getByLabel("Queued follow-ups")).toContainText("Shared queue edited");
  await secondPage.getByLabel("Cancel queued message 1").click();
  await expect(secondPage.getByLabel("Queued follow-ups")).toHaveCount(0);
  await expect(page.getByLabel("Queued follow-ups")).toHaveCount(0);
  mock.releaseChat();
  await expect(page.getByText("Live answer")).toBeVisible();
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
  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ hasText: /Session One/ })
    .first();
  await item.hover();
  await item.getByLabel("Session actions").click();
  await expect(page.getByText("Archiver")).toBeVisible();
});

Then("they should see the status {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});
