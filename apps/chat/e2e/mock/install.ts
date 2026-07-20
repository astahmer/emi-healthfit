import type { Page, Route } from "@playwright/test";
import type { Hono } from "hono";
import {
  createMockApi,
  defaultMockApi,
  sessionOneSnapshot,
  type MockApi,
} from "./app.ts";

export {
  createMockApi,
  defaultMockApi,
  sessionOneSnapshot,
  type MockApi,
  type MockApiState,
  type MockConversation,
  type MockMessage,
  type MockSnapshot,
  type MockThread,
} from "./app.ts";
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

/** @deprecated Prefer createChatMock / fulfillMockApi with a per-test app. */
export const fulfillApi = async (route: Route) => {
  await fulfillMockApi({ route, app: defaultMockApi.app });
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

export const openWithMock = async ({
  page,
  app,
  path = "/chat",
}: {
  page: Page;
  app: Hono;
  path?: string;
}) => {
  await setTestSettings(page);
  await installMockApi({ page, app });
  await page.goto(path);
};

export const openMockedChat = async (page: Page, path = "/chat") => {
  const mock = createMockApi();
  await openWithMock({ page, app: mock.app, path });
  return mock;
};

export const openSessionOne = async ({
  page,
  mock,
  path = "/chat/one",
}: {
  page: Page;
  mock?: MockApi;
  path?: string;
}) => {
  const api = mock ?? createMockApi({ state: { snapshots: { one: sessionOneSnapshot() } } });
  if (api.state.snapshots.one === undefined) api.setSnapshot("one", sessionOneSnapshot());
  await openWithMock({ page, app: api.app, path });
  return api;
};

export const createChatMock = (
  options?: Parameters<typeof createMockApi>[0],
): MockApi & {
  open: (page: Page, path?: string) => Promise<void>;
  install: (page: Page) => Promise<void>;
} => {
  const mock = createMockApi(options);
  return {
    ...mock,
    install: async (page) => {
      await setTestSettings(page);
      await installMockApi({ page, app: mock.app });
    },
    open: async (page, path = "/chat") => {
      await openWithMock({ page, app: mock.app, path });
    },
  };
};
