import type { Page, Route } from "@playwright/test";
import type { Hono } from "hono";
import { createMockApi, defaultMockApi } from "./app.ts";

export { createMockApi, defaultMockApi } from "./app.ts";
export {
  assistantStream,
  authSessionBody,
  conversationPayload,
  conversations,
  emptyAnalyticsOverview,
  multiToolStream,
} from "./fixtures.ts";

const requestFromRoute = (route: Route): Request => {
  const request = route.request();
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers())) {
    headers.set(key, value);
  }
  const method = request.method();
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    const buffer = request.postDataBuffer();
    if (buffer !== null) {
      init.body = buffer;
      init.duplex = "half";
    }
  }
  return new Request(request.url(), init);
};

export const fulfillMockApi = async ({
  route,
  app = defaultMockApi.app,
}: {
  route: Route;
  app?: Hono;
}) => {
  const response = await app.fetch(requestFromRoute(route));
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  await route.fulfill({
    status: response.status,
    headers,
    body: Buffer.from(await response.arrayBuffer()),
  });
};

/** @deprecated Prefer fulfillMockApi — kept for gradual migration of existing specs. */
export const fulfillApi = async (route: Route) => {
  await fulfillMockApi({ route });
};

export const setTestSettings = async (page: Page) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    localStorage.setItem(
      "emi-chat-settings",
      JSON.stringify({
        state: {
          settings: {
            provider: "openai",
            baseUrl: "",
            apiKey: "sk-test",
            model: "gpt-5.2-chat-latest",
            systemPrompt: "You are a test assistant.",
            coachMode: false,
          },
        },
        version: 0,
      }),
    );
  });
};

export const installMockApi = async ({
  page,
  app = defaultMockApi.app,
}: {
  page: Page;
  app?: Hono;
}) => {
  await page.route("**/api/**", async (route) => {
    await fulfillMockApi({ route, app });
  });
};

export const openMockedChat = async (page: Page, path = "/chat") => {
  await setTestSettings(page);
  await installMockApi({ page });
  await page.goto(path);
};
