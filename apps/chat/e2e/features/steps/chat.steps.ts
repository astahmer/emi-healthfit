import type { Page } from "@playwright/test";
import { expect, type Download } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import {
  connectedHevyStatus,
  sampleHevyWorkout,
  sessionOneSnapshot,
  type MockApi,
  type MockMessage,
} from "../../mock/app.ts";
import { assistantStream, conversations, multiToolStream } from "../../mock/fixtures.ts";
import { createChatMock, fulfillMockApi, installMockApi } from "../../mock/install.ts";
import {
  openSessionOne,
  openSessionOneWithChatPersistence,
  tallConversationSnapshot,
} from "./helpers.ts";
import { fixturePath } from "../../fixture-path.ts";
import { openSessionActions } from "../../open-session-actions.ts";

const { Given, When, Then } = createBdd();

type HeldGenerationScenario = {
  mock: ReturnType<typeof createChatMock>;
  replies: string[];
  secondPage?: Page;
};

const heldGenerationScenarios = new WeakMap<Page, HeldGenerationScenario>();
const pageMocks = new WeakMap<Page, MockApi>();
const pageDownloads = new WeakMap<Page, Download>();
const syncCounts = new WeakMap<Page, { listCalls: number[]; before: number }>();
const scrollPositions = new WeakMap<Page, { before: number }>();

const registerPageMock = (page: Page, mock: MockApi) => {
  pageMocks.set(page, mock);
  return mock;
};

const getPageMock = (page: Page): MockApi => {
  const mock = pageMocks.get(page);
  if (mock === undefined) throw new Error("Page mock is not initialized");
  return mock;
};

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
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on a new chat page", async ({ page }) => {
  const mock = createChatMock();
  registerPageMock(page, mock);
  await mock.open(page, "/chat");
});

Given("a user is on session one", async ({ page }) => {
  const mock = await openSessionOne(page);
  registerPageMock(page, mock);
});

Given("a user is on session one with chat persistence", async ({ page }) => {
  const mock = await openSessionOneWithChatPersistence({ page, replyText: "Saw the image" });
  registerPageMock(page, mock);
});

Given("a user is on session one whose replies accept files", async ({ page }) => {
  const mock = await openSessionOneWithChatPersistence({ page, replyText: "Got the file" });
  registerPageMock(page, mock);
});

Given("a user is on session one with searchable sessions", async ({ page }) => {
  const listCalls: number[] = [];
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
    extend: (app, state) => {
      app.get("/api/conversations", (context) => {
        listCalls.push(0);
        const search = context.req.query("search")?.trim().toLowerCase() ?? "";
        const list =
          search === ""
            ? state.conversations
            : state.conversations.filter((conversation) =>
                (conversation.title ?? "").toLowerCase().includes(search),
              );
        return context.json({ conversations: list });
      });
    },
  });
  registerPageMock(page, mock);
  syncCounts.set(page, { listCalls, before: listCalls.length });
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on session one with a held generation", async ({ page }) => {
  const scenario = await openHeldGeneration(page);
  registerPageMock(page, scenario.mock);
});

Given(
  "a user is on session one with a held generation that replies {int} times",
  async ({ page }, count: number) => {
    const mock = createChatMock({
      state: {
        snapshots: { one: sessionOneSnapshot() },
        chat: { persist: true, replyText: "Reply 1" },
      },
    });
    const replies = Array.from({ length: count }, (_, index) => `Reply ${index + 1}`);
    Object.defineProperty(mock.state.chat, "replyText", {
      configurable: true,
      get: () => replies[Math.max(0, mock.state.chat.calls - 1)] ?? "Mock answer",
      set: () => undefined,
    });
    mock.holdChat();
    registerPageMock(page, mock);
    await mock.open(page, "/chat/one");
    await expect(page.getByText("one message answer")).toBeVisible();
    heldGenerationScenarios.set(page, { mock, replies });
  },
);

Given("a user has a held generation with queued follow-ups in one tab", async ({ page }) => {
  await openHeldGeneration(page);
  await sendAndQueue({ page, message: "First question", queuedMessage: "Shared queue item" });
  await expect(page.getByLabel("Queued follow-ups")).toContainText("Shared queue item");
});

Given(
  "a user is on session one that replies {string} to the next message",
  async ({ page }, replyText: string) => {
    const mock = await openSessionOneWithChatPersistence({ page, replyText });
    registerPageMock(page, mock);
  },
);

Given("a user starts a temporary chat", async ({ page }) => {
  const mock = createChatMock({
    state: { chat: { persist: true, replyText: "Ghost reply" } },
    extend: (app, state) => {
      const withCount = state as MockApi["state"] & { createdConversationCount: number };
      withCount.createdConversationCount = 0;
      app.post("/api/conversations", (context) => {
        withCount.createdConversationCount += 1;
        return context.json({ id: "should-not-create" }, 201);
      });
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat");
  await page.getByRole("button", { name: /Temporary/ }).click();
});

Given("a user starts a temporary chat that replies {string}", async ({ page }, reply: string) => {
  const mock = createChatMock({
    state: { chat: { persist: true, replyText: reply } },
    extend: (app, state) => {
      const withFetches = state as MockApi["state"] & { temporaryMessageFetches: string[] };
      withFetches.temporaryMessageFetches = [];
      app.get("/api/conversations/:id/messages", (context) => {
        const id = context.req.param("id");
        withFetches.temporaryMessageFetches.push(id);
        if (id.startsWith("temp_")) {
          return context.json({ _tag: "NotFound", message: "Conversation not found" }, 404);
        }
        return context.json({ error: "unexpected conversation fetch" }, 500);
      });
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat");
  await page.getByRole("button", { name: /Temporary/ }).click();
});

Given("a user starts a temporary chat that keeps conversations", async ({ page }) => {
  const mock = createChatMock({
    state: {
      createConversationId: "kept-ghost",
      chat: { persist: true, replyText: "Ghost reply" },
    },
  });
  registerPageMock(page, mock);
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
  registerPageMock(page, mock);
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
  registerPageMock(page, mock);
  await mock.open(page, "/chat");
});

Given("a user is on a new chat page with session one listed", async ({ page }) => {
  const mock = createChatMock({
    state: {
      conversations: [
        {
          id: "one",
          title: "Session One",
          status: "regular",
          pinned: false,
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T12:00:00.000Z",
        },
      ],
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat");
  await expect(page.getByRole("link", { name: "Session One" })).toBeVisible();
});

Given("a user is on session one whose delete request is held", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  mock.holdDelete();
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on session one whose message loads are held", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  mock.holdMessages();
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByRole("link", { name: "Session One" })).toBeVisible();
});

Given("a user is on session one with an incomplete coach reply", async ({ page }) => {
  const base = sessionOneSnapshot();
  const mock = createChatMock({
    state: {
      snapshots: {
        one: {
          ...base,
          messages: [
            {
              id: "one-user",
              conversationId: "one",
              parentId: null,
              role: "user",
              parts: [{ type: "text", text: "Question from an older turn" }],
              createdAt: "2026-07-14T10:00:00.000Z",
            },
            {
              id: "one-assistant",
              conversationId: "one",
              parentId: "one-user",
              role: "assistant",
              parts: [],
              createdAt: "2026-07-14T10:01:00.000Z",
            },
          ],
        },
      },
      chat: { persist: true, replyText: "Recovered coach reply" },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("Question from an older turn")).toBeVisible();
});

Given(
  "a user is on session one whose replies fail with status {int}",
  async ({ page }, status: number) => {
    const mock = createChatMock({
      state: {
        snapshots: { one: sessionOneSnapshot() },
        chat: { failStatus: status, failBody: JSON.stringify({ error: "Generation timed out" }) },
      },
    });
    registerPageMock(page, mock);
    await mock.open(page, "/chat/one");
    await expect(page.getByText("one message answer")).toBeVisible();
  },
);

Given("a user is on session one with a persisted orphaned turn", async ({ page }) => {
  const base = sessionOneSnapshot();
  const mock = createChatMock({
    state: {
      snapshots: {
        one: {
          ...base,
          messages: [
            ...base.messages,
            {
              id: "30dd4f3b-02af-4168-83cc-f70d395c715c",
              conversationId: "one",
              parentId: null,
              role: "user",
              parts: [{ type: "text", text: "Previous request" }],
              createdAt: "2026-07-17T00:00:02.000Z",
            },
          ],
        },
      },
      chat: { persist: true, replyText: "Continued response" },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("Previous request")).toBeVisible();
});

Given("a user is on session one with a resumable generation", async ({ page }) => {
  const base = sessionOneSnapshot();
  const unfinished = {
    ...base,
    messages: [base.messages[0], { ...base.messages[1], parts: [] as unknown[] }],
  };
  const mock = createChatMock({
    state: {
      snapshots: { one: unfinished },
      chat: {
        resumeStreamBody: assistantStream({
          messageId: "resumed-assistant",
          text: "Resumed answer",
        }),
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
});

Given("a user is on session one whose replies conflict", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: {
        failStatus: 409,
        failBody: JSON.stringify({
          error: "A generation is already running",
          generationId: "generation-conflict-1",
        }),
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on session one with a tool-answering generation", async ({ page }) => {
  const base = sessionOneSnapshot();
  const textOnly = {
    ...base,
    messages: base.messages.map((message) =>
      message.role === "assistant"
        ? { ...message, parts: [{ type: "text", text: "one message answer" }] }
        : message,
    ),
  };
  const mock = createChatMock({
    state: {
      snapshots: { one: textOnly },
      chat: {
        persist: true,
        replyText: "Mixed tools done",
        streamBody: multiToolStream({ messageId: "tools-assistant" }),
        persistAssistantParts: [
          {
            type: "tool-invocation",
            toolName: "get_recovery",
            toolCallId: "call-1",
            state: "output-available",
            input: {},
            output: { label: "Ready", explanation: "Recovered well" },
          },
          {
            type: "tool-invocation",
            toolName: "get_workout_history",
            toolCallId: "call-2",
            state: "output-error",
            input: {},
            errorText: "Only one SELECT query is allowed.",
          },
          { type: "text", text: "Mixed tools done" },
        ],
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on session one whose fork fails", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      fork: { failStatus: 500 },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on session one with branch {string}", async ({ page }, title: string) => {
  const mock = createChatMock({
    state: {
      snapshots: {
        one: sessionOneSnapshot({
          threads: [
            {
              id: "branch-1",
              conversation_id: "one",
              anchor_message_id: "one-assistant",
              title,
              status: "regular",
              pinned: false,
              message_ids: ["one-user", "one-assistant"],
              created_at: "2026-07-14T10:02:00.000Z",
              updated_at: "2026-07-14T10:02:00.000Z",
            },
          ],
        }),
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given(
  "a user is on session one with branches {string} and {string}",
  async ({ page }, first: string, second: string) => {
    const branch = (id: string, title: string, createdAt: string) => ({
      id,
      conversation_id: "one",
      anchor_message_id: "one-assistant",
      title,
      status: "regular" as const,
      pinned: false,
      message_ids: ["one-user", "one-assistant"],
      created_at: createdAt,
      updated_at: createdAt,
    });
    const mock = createChatMock({
      state: {
        snapshots: {
          one: sessionOneSnapshot({
            threads: [
              branch("branch-a", first, "2026-07-14T10:02:00.000Z"),
              branch("branch-b", second, "2026-07-14T10:03:00.000Z"),
            ],
          }),
        },
      },
    });
    registerPageMock(page, mock);
    await mock.open(page, "/chat/one");
    await expect(page.getByText("one message answer")).toBeVisible();
  },
);

Given("a user is on session one which is pinned", async ({ page }) => {
  const mock = createChatMock({
    state: {
      conversations: [
        {
          id: "one",
          title: "Session One",
          status: "regular",
          pinned: true,
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T12:00:00.000Z",
        },
      ],
      snapshots: { one: sessionOneSnapshot() },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on session one with native sharing mocked", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one", { share: "mock" });
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given(
  "a user is on an empty conversation that replies {string}",
  async ({ page }, reply: string) => {
    const emptyConversation = {
      id: "empty",
      title: "Empty conversation",
      status: "regular" as const,
      pinned: false,
      created_at: "2026-07-17T00:00:00.000Z",
      updated_at: "2026-07-17T00:00:00.000Z",
    };
    const mock = createChatMock({
      state: {
        conversations: [...conversations, emptyConversation],
        snapshots: {
          empty: { conversation: emptyConversation, messages: [], threads: [] },
        },
        chat: { persist: true, replyText: reply },
      },
    });
    registerPageMock(page, mock);
    await mock.open(page, "/chat/empty");
    await expect(page.getByText("What are we working on?")).toBeVisible();
  },
);

Given("a user is on session one whose stream ends without a finish event", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      chat: {
        persist: true,
        replyText: "Persisted completion",
        streamBody: [
          'data: {"type":"start","messageId":"persisted-assistant"}',
          'data: {"type":"text-start","id":"persisted-text"}',
          'data: {"type":"text-delta","id":"persisted-text","delta":"Persisted completion"}',
          "",
        ].join("\n\n"),
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on a new chat page on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = createChatMock();
  registerPageMock(page, mock);
  await mock.open(page, "/chat");
});

Given("a user is on session one with reasoning and a message reference", async ({ page }) => {
  const messages: MockMessage[] = [
    {
      id: "one-user",
      conversationId: "one",
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "one message" }],
      createdAt: "2026-07-14T10:00:00.000Z",
    },
    {
      id: "one-assistant",
      conversationId: "one",
      parentId: null,
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Thinking about recovery metrics." },
        {
          type: "text",
          text: 'See earlier turn <message id="one-user" /> for context.',
        },
      ],
      createdAt: "2026-07-14T10:01:00.000Z",
    },
  ];
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot({ messages }) } },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
});

Given("a user is on session one with rich component tool results", async ({ page }) => {
  const snapshot = sessionOneSnapshot();
  const assistant = snapshot.messages.find((message) => message.role === "assistant");
  if (assistant === undefined)
    throw new Error("Expected an assistant message in the chat fixture.");
  assistant.parts = [
    {
      type: "tool-invocation",
      toolName: "get_summary",
      toolCallId: "summary-1",
      state: "output-available",
      input: {},
      output: { dailyActivity: 1655 },
    },
    {
      type: "tool-invocation",
      toolName: "get_recovery",
      toolCallId: "recovery-1",
      state: "output-available",
      input: {},
      output: { label: "Ready", explanation: "Good recovery" },
    },
    {
      type: "tool-invocation",
      toolName: "get_exercise_progress",
      toolCallId: "progress-1",
      state: "output-available",
      input: {},
      output: {
        exercise_title: "Bench Press",
        weeks: 8,
        workouts: [
          {
            session_id: "workout-1",
            title: "Full body",
            start_time: "2026-07-28T10:00:00.000Z",
            max_weight_kg: 100,
            max_volume_kg: 1200,
            total_volume_kg: 2072,
            total_reps: 24,
            sets: 3,
          },
        ],
        personalRecord: { weight_kg: 100, reps: 5, volume_kg: 500 },
      },
    },
    {
      type: "tool-invocation",
      toolName: "render_component",
      toolCallId: "metric-1",
      state: "output-available",
      input: {},
      output: {
        spec: {
          root: "metric",
          elements: {
            metric: {
              type: "MetricCard",
              props: { label: "Steps", value: 8742, unit: "steps/day", trend: "flat" },
            },
          },
        },
      },
    },
    {
      type: "tool-invocation",
      toolName: "get_sleep_trend",
      toolCallId: "sleep-1",
      state: "output-available",
      input: {},
      output: {
        days: 2,
        avg_in_bed_min: 495,
        avg_asleep_min: 450,
        avg_awake_min: 45,
        avg_sleep_hours: 7.5,
        nights: [
          {
            date: "2026-07-18",
            in_bed_min: 480,
            asleep_min: 420,
            awake_min: 60,
          },
          {
            date: "2026-07-19",
            in_bed_min: 510,
            asleep_min: 480,
            awake_min: 30,
          },
        ],
      },
    },
    {
      type: "tool-invocation",
      toolName: "get_workout_streak",
      toolCallId: "streak-1",
      state: "output-available",
      input: {},
      output: {
        current_streak: 3,
        longest_streak: 7,
        last_workout_date: "2026-07-19",
      },
    },
    {
      type: "tool-invocation",
      toolName: "get_training_load",
      toolCallId: "load-1",
      state: "output-available",
      input: {},
      output: {
        weeks: [
          {
            week_start: "2026-07-13",
            workouts: 3,
            sets: 18,
            volume_kg: 6500,
            duration_sec: 10_800,
          },
        ],
        total_volume_kg: 6500,
        current_week_volume_kg: 6500,
        previous_week_volume_kg: 5000,
        volume_change_pct: 30,
      },
    },
    {
      type: "tool-invocation",
      toolName: "get_recovery_timeline",
      toolCallId: "timeline-1",
      state: "output-available",
      input: {},
      output: {
        days: [
          { date: "2026-07-18", asleep_min: 420, workouts: 1, volume_kg: 2000 },
          { date: "2026-07-19", asleep_min: 480, workouts: 0, volume_kg: 0 },
        ],
        average_sleep_hours: 7.5,
      },
    },
    {
      type: "tool-invocation",
      toolName: "get_goal_progress",
      toolCallId: "goals-1",
      state: "output-available",
      input: {},
      output: {
        period_days: 7,
        average_steps: 8500,
        step_goal: 10_000,
        workouts: 3,
        workouts_goal: 3,
        latest_weight_kg: 78.5,
        target_weight_kg: 75,
        weight_remaining_kg: -3.5,
      },
    },
    {
      type: "tool-invocation",
      toolName: "get_next_workout",
      toolCallId: "next-1",
      state: "output-available",
      input: {},
      output: {
        suggested_title: "Upper body",
        readiness: "ready",
        reason: "Your last logged session was Lower body; this rotates the next focus.",
        last_workout_date: "2026-07-19",
        last_workout_title: "Lower body",
        days_since_last_workout: 1,
        recent_workout_count: 3,
        sleep_average_hours: 7.5,
      },
    },
  ];
  const mock = createChatMock({
    state: { snapshots: { one: snapshot } },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("Good recovery")).toBeVisible();
});

Given("a user is on session one whose compaction fails", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: { one: sessionOneSnapshot() },
      compact: { failStatus: 500 },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user is on session one without clipboard permission", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await page.context().grantPermissions([]);
  await expect(page.getByText("one message answer")).toBeVisible();
});

Given("a user has an existing note {string}", async ({ page }, content: string) => {
  const mock = createChatMock({
    state: {
      notes: [
        {
          id: "note-existing",
          content,
          created_at: "2026-07-18T10:00:00.000Z",
          updated_at: "2026-07-18T10:00:00.000Z",
        },
      ],
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/notes");
  await expect(page.getByText(content)).toBeVisible();
});

Given("a user has many notes", async ({ page }) => {
  const notes = Array.from({ length: 40 }, (_, index) => ({
    id: `note-scroll-${index}`,
    content: `Scrollable note ${index} with enough text to force overflow on the notes page.`,
    created_at: "2026-07-18T10:00:00.000Z",
    updated_at: "2026-07-18T10:00:00.000Z",
  }));
  const mock = createChatMock({ state: { notes } });
  registerPageMock(page, mock);
  await mock.open(page, "/notes");
});

Given("a user has a memory {string}", async ({ page }, content: string) => {
  const mock = createChatMock({
    state: {
      memories: [
        {
          id: "memory-existing",
          content,
          source: "manual",
          thread_id: null,
          created_at: "2026-07-18T10:00:00.000Z",
        },
      ],
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/memory");
  await expect(page.getByText(content)).toBeVisible();
});

Given("a user has a memory {string} with a summary", async ({ page }, content: string) => {
  const mock = createChatMock({
    state: {
      memories: [
        {
          id: "memory-source",
          content,
          source: "manual",
          thread_id: null,
          created_at: "2026-07-18T10:00:00.000Z",
        },
      ],
      memorySummary: {
        content: "The user prefers concise training guidance.",
        memory_count: 1,
        updated_at: "2026-07-18T10:00:00.000Z",
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/memory");
  await expect(page.getByLabel("Merged memory summary")).toHaveValue(
    "The user prefers concise training guidance.",
  );
});

Given("a user has many memories", async ({ page }) => {
  const memories = Array.from({ length: 40 }, (_, index) => ({
    id: `memory-scroll-${index}`,
    content: `Scrollable memory ${index} with enough text to force overflow on the memory page.`,
    source: "manual",
    thread_id: null,
    created_at: "2026-07-18T10:00:00.000Z",
  }));
  const mock = createChatMock({ state: { memories } });
  registerPageMock(page, mock);
  await mock.open(page, "/memory");
});

Given("a signed-out user with guest sign-in failing", async ({ page }) => {
  const mock = createChatMock({ state: { authSession: null, anonymousOk: false } });
  registerPageMock(page, mock);
  await mock.install(page);
});

Given("a signed-out user with social sign-in available", async ({ page }) => {
  const mock = createChatMock({ state: { authSession: null, socialOk: true } });
  registerPageMock(page, mock);
  await mock.install(page);
});

Given("a user is on the settings page", async ({ page }) => {
  const mock = createChatMock();
  registerPageMock(page, mock);
  await mock.open(page, "/settings");
});

Given("a user is on the settings page with a stale Hevy connection", async ({ page }) => {
  const mock = createChatMock({
    state: {
      hevy: {
        status: connectedHevyStatus({
          fresh: false,
          lastErrorCode: "hevy_auth",
          lastErrorAt: "2026-07-20T11:00:00.000Z",
        }),
        workouts: [sampleHevyWorkout()],
        lastConnectApiKey: "already-connected",
        syncCalls: 0,
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/settings");
  await expect(page.getByText(/May be stale/)).toBeVisible();
});

Given("a user is on the settings page with a connected Hevy account", async ({ page }) => {
  const mock = createChatMock({
    state: {
      hevy: {
        status: connectedHevyStatus(),
        workouts: [sampleHevyWorkout()],
        lastConnectApiKey: "already-connected",
        syncCalls: 0,
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/settings");
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
});

Given(
  "a user is on the settings page with a linked Discord account {string}",
  async ({ page }, discordUserId: string) => {
    const mock = createChatMock({
      state: {
        discord: {
          links: [{ discord_user_id: discordUserId, created_at: "2026-07-21T00:00:00.000Z" }],
          codes: [],
          createCalls: 0,
        },
      },
    });
    registerPageMock(page, mock);
    await mock.open(page, "/settings");
    await expect(page.getByText(discordUserId)).toBeVisible();
  },
);

Given("a user without an API key is on the chat page", async ({ page }) => {
  const mock = createChatMock();
  registerPageMock(page, mock);
  await installMockApi({ page, app: mock.app });
  await page.goto("/chat");
});

Given("a user is on a tall session one", async ({ page }) => {
  const mock = createChatMock({
    state: {
      snapshots: {
        one: tallConversationSnapshot({ id: "one", title: "Session One", turns: 10 }),
        two: tallConversationSnapshot({ id: "two", title: "Session Two", turns: 10 }),
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("Session One assistant turn 9", { exact: true })).toBeVisible();
});

Given("a user is on a tall session one on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = createChatMock({
    state: {
      snapshots: {
        one: tallConversationSnapshot({ id: "one", title: "Session One", turns: 10 }),
        two: tallConversationSnapshot({ id: "two", title: "Session Two", turns: 10 }),
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("Session One assistant turn 9", { exact: true })).toBeVisible();
});

Given("a user is on the summary page with analytics", async ({ page }) => {
  const mock = createChatMock({
    state: {
      analytics: {
        days: 90,
        activity: [{ date: "2026-07-01", steps: 8_000, active_kcal: 400, exercise_min: 45 }],
        sleep: [{ date: "2026-07-01", asleep_min: 420, in_bed_min: 480 }],
        training: [{ date: "2026-07-01", workouts: 1, volume_kg: 1_200, duration_sec: 3600 }],
        body: [{ date: "2026-07-01", weight_kg: 80, body_fat_pct: null, lean_mass_kg: null }],
        exercises: [{ exercise_title: "Bench press", sets: 12, volume_kg: 900 }],
        highlights: {
          averageSteps: 8_000,
          averageSleepMinutes: 420,
          workouts: 3,
          trainingVolumeKg: 1_200,
          weightChangeKg: -0.5,
        },
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/summary");
});

Given("a user is on the upload page", async ({ page }) => {
  const mock = createChatMock();
  registerPageMock(page, mock);
  await mock.open(page, "/upload");
});

Given("a user with a connected Hevy account is on the workouts page", async ({ page }) => {
  const mock = createChatMock({
    state: {
      hevy: {
        status: connectedHevyStatus(),
        workouts: [sampleHevyWorkout()],
        lastConnectApiKey: "key",
        syncCalls: 0,
      },
    },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/workouts");
});

Given("a user is on session one with cached history", async ({ page }) => {
  const mock = createChatMock({
    state: { snapshots: { one: sessionOneSnapshot() } },
  });
  registerPageMock(page, mock);
  await mock.open(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
  await page.waitForTimeout(250);
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

When("they queue {int} follow-ups", async ({ page }, count: number) => {
  await page.getByLabel("Message input").fill("First question");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();
  for (let index = 1; index < count; index += 1) {
    await page.getByLabel("Message input").fill(`Queue item ${index + 1}`);
    await page.getByLabel("Send after reply").click();
  }
});

When(
  "they edit queued message {int} to {string}",
  async ({ page }, index: number, text: string) => {
    await page.getByLabel(`Edit queued message ${index}`).click();
    await page.getByLabel("Message input").fill(text);
    await page.getByLabel("Update queued message").click();
  },
);

When("they force-send queued message {int}", async ({ page }, index: number) => {
  await page.getByLabel(`Send queued message ${index} now`).click();
});

When("they cancel all queued follow-ups", async ({ page }) => {
  await page.getByText("Clear queue").click();
});

When("they press ArrowUp to edit the last queued message", async ({ page }) => {
  await page.getByLabel("Message input").press("ArrowUp");
});

When("they press Escape to cancel the edit", async ({ page }) => {
  await page.getByLabel("Message input").press("Escape");
});

When("they refresh the conversation", async ({ page }) => {
  await page.reload();
  await expect(page.getByText("one message answer")).toBeVisible();
});

When("the held chat is released", async ({ page }) => {
  getHeldGenerationScenario(page).mock.releaseChat();
});

When("they attach the image {string} while streaming", async ({ page }, filename: string) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
});

When("they queue the attachment before the reply finishes", async ({ page }) => {
  await expect(page.getByLabel("Send after reply")).toBeVisible();
  await page.getByLabel("Send after reply").click();
});

When(
  "they queue {string} and {string} before the reply finishes",
  async ({ page }, first: string, second: string) => {
    await sendAndQueue({ page, message: "First question", queuedMessage: first });
    await page.getByLabel("Message input").fill(second);
    await page.getByLabel("Send after reply").click();
    const queue = page.getByLabel("Queued follow-ups");
    await expect(queue).toContainText(first);
    await expect(queue).toContainText(second);
  },
);

When("they queue {string} before the reply finishes", async ({ page }, message: string) => {
  await sendAndQueue({ page, message: "First question", queuedMessage: message });
});

Then(
  "the queued follow-ups should contain {string} and {string}",
  async ({ page }, first: string, second: string) => {
    const queue = page.getByLabel("Queued follow-ups");
    await expect(queue).toContainText(first);
    await expect(queue).toContainText(second);
  },
);

Then("the queued follow-ups should be empty", async ({ page }) => {
  await expect(page.getByLabel("Queued follow-ups")).toHaveCount(0);
});

Then("the queued follow-ups should contain {string}", async ({ page }, text: string) => {
  await expect(page.getByLabel("Queued follow-ups")).toContainText(text);
});

Then("the queued follow-ups should not be in editing mode", async ({ page }) => {
  await expect(page.getByLabel("Queued follow-ups")).not.toContainText("(editing)");
});

Then("the queued replies should be displayed", async ({ page }) => {
  const { mock, replies } = getHeldGenerationScenario(page);
  mock.releaseChat();
  for (let index = 1; index < replies.length; index += 1) {
    const reply = replies[index];
    if (reply !== undefined) {
      await expect(page.getByText(reply).first()).toBeVisible();
    }
  }
});

Then("the forced turn should appear with its attachment", async ({ page }) => {
  const { mock } = getHeldGenerationScenario(page);
  mock.releaseChat();
  await expect(page.getByText("Follow-up answer").first()).toBeVisible();
  const parts = mock.state.chat.lastBody?.messages?.[0]?.parts ?? [];
  expect(parts.some((part) => part.type === "file" && part.filename === "queue.png")).toBe(true);
});

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
    mimeType: filename.endsWith(".bmp") ? "image/bmp" : "image/png",
    buffer: Buffer.from("image"),
  });
});

When("they attach the photo {string}", async ({ page }, filename: string) => {
  await page.locator('input[type="file"]').setInputFiles(fixturePath(filename));
  const basename = filename.replace(/\.[^.]+$/, "");
  await expect(page.getByText(new RegExp(basename))).toBeVisible();
});

When("they attach {int} images", async ({ page }, count: number) => {
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: count }, (_, index) => ({
      name: `progress-${index + 1}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(`image-${index + 1}`),
    })),
  );
});

When("they attach {int} more image", async ({ page }, count: number) => {
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: count }, (_, index) => ({
      name: `progress-${index + 3}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(`image-extra-${index + 1}`),
    })),
  );
});

Then("{int} attachment previews should be visible", async ({ page }, count: number) => {
  await expect(page.getByRole("button", { name: /^Remove progress-/ })).toHaveCount(count);
});

When("they remove the attachment {string}", async ({ page }, filename: string) => {
  await page.getByLabel(`Remove ${filename}`).click();
});

When("they paste the image {string}", async ({ page }, filename: string) => {
  await page.getByLabel("Message input").evaluate((input, name) => {
    const file = new File(["image"], name, { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
  }, filename);
});

Then(
  "the attachment preview {string} should not be visible",
  async ({ page }, filename: string) => {
    await expect(page.getByText(filename)).toHaveCount(0);
  },
);

Then("the unsupported image notice should be visible", async ({ page }) => {
  await expect(page.getByText(/unsupported image format/i)).toBeVisible();
});

Then("the unsupported image notice should not be visible", async ({ page }) => {
  await expect(page.getByText(/unsupported image format/i)).toHaveCount(0);
});

When("they restore the session from the sidebar", async ({ page }) => {
  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ hasText: /Session One/ })
    .first();
  await item.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await item.getByLabel("Session actions").click({ force: true });
  await page.getByText("Restaurer").click({ force: true });
});

When("they copy the assistant message", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#message-one-assistant").getByLabel("Copy message").click();
});

When("they copy the assistant message without clipboard permission", async ({ page }) => {
  await page.locator("#message-one-assistant").getByLabel("Copy message").click();
});

When("they open session one from the sidebar", async ({ page }) => {
  await page.getByRole("link", { name: "Session One" }).click();
  await expect(page).toHaveURL(/\/chat\/one$/);
  await expect(page.getByText("one message answer")).toBeVisible();
});

When("they delete the active session from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  await page.getByText("Supprimer", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
});

When("they cancel deleting the active session", async ({ page }) => {
  await openSessionActions(page);
  await page.getByText("Supprimer", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Annuler" }).click();
});

When("they delete session two from the sidebar", async ({ page }) => {
  await openSessionActions(page, { href: "/chat/two" });
  await page.getByText("Supprimer", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
});

When("the delete request finishes", async ({ page }) => {
  getPageMock(page).releaseDelete();
});

When("the message loads finish", async ({ page }) => {
  getPageMock(page).releaseMessages();
});

When("they retry the coach response", async ({ page }) => {
  await page.getByRole("button", { name: "Retry coach response" }).click();
});

When("they retry the failed request", async ({ page }) => {
  await page.getByRole("button", { name: "Retry this request" }).click();
});

When("they stop the generation", async ({ page }) => {
  await page.getByLabel("Stop generating").click();
});

When("they force-send a queued follow-up before the reply finishes", async ({ page }) => {
  const { mock, replies } = getHeldGenerationScenario(page);
  await page.getByLabel("Message input").fill("First question");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();
  await page.getByLabel("Message input").fill("Send me now");
  await page.getByLabel("Send after reply").click();
  await expect(page.getByLabel("Queued follow-ups")).toContainText("Send me now");
  replies[1] = "Forced answer";
  await page.getByLabel("Send queued message 1 now").click();
  mock.releaseChat();
});

When("they force-send the queued message from the second tab", async ({ page }) => {
  const { mock, secondPage, replies } = getHeldGenerationScenario(page);
  if (secondPage === undefined) throw new Error("Second tab is not initialized");
  replies[1] = "Forced from other tab";
  await secondPage.getByLabel("Send queued message 1 now").click();
  mock.releaseChat();
});

When("they type {string} while the reply is held", async ({ page }, draft: string) => {
  await page.getByLabel("Message input").fill("First");
  await page.getByLabel("Send message").click();
  await expect(page.getByLabel("Stop generating")).toBeVisible();
  await page.getByLabel("Message input").fill(draft);
});

When("they open session two from the sidebar", async ({ page }) => {
  await page.getByText("Session Two", { exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/two$/);
});

When("they search this conversation for {string}", async ({ page }, query: string) => {
  await page.getByRole("button", { name: "Search conversation" }).click();
  await page.getByLabel("Search this conversation").fill(query);
});

When("they discard the branch {string}", async ({ page }, title: string) => {
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Discard branch" }).click();
});

When("they restore the discarded branch", async ({ page }) => {
  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("menuitem", { name: "Branch" }).click();
});

When("they focus the branch {string}", async ({ page }, title: string) => {
  await page.getByRole("button", { name: title, exact: true }).click();
});

When("they rename the branch {string} to {string}", async ({ page }, from: string, to: string) => {
  await page.getByRole("button", { name: `Actions for ${from}` }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Branch title").fill(to);
  await page.getByRole("button", { name: "Save branch title" }).click();
});

When("they pin the branch {string}", async ({ page }, title: string) => {
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Pin" }).click();
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

Then("the URL should be the new chat page", async ({ page }) => {
  await expect(page).toHaveURL(/\/chat\/?$/);
});

Then("the new chat suggestion {string} should be visible", async ({ page }, suggestion: string) => {
  await expect(page.getByRole("button", { name: suggestion })).toBeVisible();
});

Then("session one should not be listed in the sidebar", async ({ page }) => {
  await expect(
    page.locator('[data-sidebar="menu-item"]').filter({ hasText: "Session One" }),
  ).toHaveCount(0);
});

Then("session two should not be listed in the sidebar", async ({ page }) => {
  await expect(
    page.locator('[data-sidebar="menu-item"]').filter({ hasText: "Session Two" }),
  ).toHaveCount(0);
});

Then("the coach failure notice should be visible", async ({ page }) => {
  await expect(page.getByText("Coach did not finish this reply.")).toBeVisible();
});

Then("the retried request should replace the previous user message", async ({ page }) => {
  expect(getPageMock(page).state.chat.lastBody?.replaceMessageId).toBe("one-user");
});

Then("the request should not carry a replacement message", async ({ page }) => {
  expect(getPageMock(page).state.chat.lastBody).not.toHaveProperty("replaceMessageId");
});

Then("the resumed answer {string} should be displayed", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
  expect(getPageMock(page).state.chat.resumeCalls).toBeGreaterThan(0);
});

Then("the generation conflict notice should be visible", async ({ page }) => {
  await expect(
    page.getByText(
      "A reply is already in progress elsewhere. Wait for it to finish, or stop it there.",
    ),
  ).toBeVisible();
});

Then("the tool output {string} should be visible", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("the tool error {string} should be visible", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("the tool name {string} should be visible", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("the {string} button should be visible", async ({ page }, label: string) => {
  await expect(page.getByRole("button", { name: label })).toBeVisible();
});

Then("the send message button should be visible", async ({ page }) => {
  await expect(page.getByLabel("Send message")).toBeVisible();
});

Then("the forced turn should appear without the interrupted reply", async ({ page }) => {
  await expect(page.locator('[id^="message-"]').filter({ hasText: "Send me now" })).toBeVisible();
  await expect(page.getByText("Forced answer").first()).toBeVisible();
  await expect(page.getByText("Should not appear")).toHaveCount(0);
  await expect(page.getByText("one message answer")).toBeVisible();
});

Then(
  "the forced turn should appear in the first tab without the interrupted reply",
  async ({ page }) => {
    await expect(
      page.locator('[id^="message-"]').filter({ hasText: "Shared queue item" }),
    ).toBeVisible();
    await expect(page.getByText("Forced from other tab").first()).toBeVisible();
  },
);

Then(
  "the draft {string} should be preserved after the reply finishes",
  async ({ page }, draft: string) => {
    const { mock } = getHeldGenerationScenario(page);
    mock.releaseChat();
    await expect(page.getByLabel("Send message")).toBeVisible();
    await expect(page.getByLabel("Message input")).toHaveValue(draft);
  },
);

Then("the branch {string} should not be visible", async ({ page }, title: string) => {
  await expect(page.getByRole("button", { name: title, exact: true })).toHaveCount(0);
});

Then("the branch {string} should be pinned", async ({ page }, title: string) => {
  const mock = getPageMock(page);
  const thread = mock.state.snapshots.one?.threads.find((candidate) => candidate.title === title);
  expect(thread?.pinned).toBe(true);
});

When("they rename session one to {string} from the sidebar", async ({ page }, title: string) => {
  await openSessionActions(page);
  await page.getByText("Renommer").click();
  await page.getByRole("list").getByRole("textbox").fill(title);
  await page.getByRole("list").getByRole("textbox").press("Enter");
  await expect(page.getByText(title).first()).toBeVisible();
});

When("they try to rename session one to an empty title from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  await page.getByText("Renommer").click();
  await page.getByRole("list").getByRole("textbox").fill("");
  await page.getByRole("list").getByRole("textbox").press("Enter");
});

Then("the session rename input should be visible", async ({ page }) => {
  await expect(page.getByRole("list").getByRole("textbox")).toBeVisible();
});

When("they pin session one from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  await page.getByText("Épingler").click();
});

When("they unpin session one from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  await page.getByText("Désépingler").click();
});

When("they copy session one as markdown from the sidebar", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openSessionActions(page);
  await page.getByText("Copier en .md").click();
});

When("they share session one from the sidebar", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openSessionActions(page);
  await page.getByText("Partager").click();
});

When("they download session one as markdown from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Télécharger").click();
  pageDownloads.set(page, await downloadPromise);
});

When("they clone session one from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  await page.getByText("Cloner").click();
});

When("they archive session one from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  await page.getByText("Archiver").click();
});

When("they delete session one from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  await page.getByText("Supprimer", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
});

When("they start a new chat from the header", async ({ page }) => {
  await page.getByLabel("New chat").click();
  await expect(page).toHaveURL(/\/chat\/?$/);
});

When("they export diagnostics from the sidebar", async ({ page }) => {
  await openSessionActions(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Exporter les diagnostics").click();
  pageDownloads.set(page, await downloadPromise);
});

When("they search sessions for {string}", async ({ page }, query: string) => {
  await page.getByLabel("Search sessions").fill(query);
});

When("they clear the session search", async ({ page }) => {
  await page.getByLabel("Search sessions").fill("");
});

When("they sync sessions from the sidebar", async ({ page }) => {
  const counts = syncCounts.get(page);
  if (counts !== undefined) counts.before = counts.listCalls.length;
  await page.getByLabel("Sync sessions").click();
});

Then("the session list should have been synced", async ({ page }) => {
  const counts = syncCounts.get(page);
  if (counts !== undefined) {
    await expect.poll(() => counts.listCalls.length).toBeGreaterThan(counts.before);
  }
});

When("the next reply will be {string}", async ({ page }, reply: string) => {
  getPageMock(page).state.chat.replyText = reply;
});

Then("the clipboard should contain {string}", async ({ page }, fragment: string) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(fragment);
});

Then("a markdown download should start", async ({ page }) => {
  const download = pageDownloads.get(page);
  expect(download?.suggestedFilename()).toMatch(/session-one\.md|conversation\.md/);
});

Then("a diagnostics download should start", async ({ page }) => {
  const download = pageDownloads.get(page);
  expect(download?.suggestedFilename()).toBe("one-diagnostics.json");
});

Then("a message markdown download should start", async ({ page }) => {
  const download = pageDownloads.get(page);
  expect(download?.suggestedFilename()).toMatch(/^message-.*\.md$/);
});

Then("the native share sheet should receive the session URL", async ({ page }) => {
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as Window & { emiShareCalls?: ShareData[] }).emiShareCalls?.length ?? 0,
      ),
    )
    .toBe(1);
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as Window & { emiShareCalls?: ShareData[] }).emiShareCalls?.[0]?.url ?? "",
      ),
    )
    .toContain("/chat/one");
});

Then("the link {string} should be visible", async ({ page }, label: string) => {
  await expect(page.getByRole("link", { name: label })).toBeVisible();
});

Then("the link {string} should not be visible", async ({ page }, label: string) => {
  await expect(page.getByRole("link", { name: label })).toHaveCount(0);
});

Then("the message {string} should be hidden", async ({ page }, text: string) => {
  await expect(page.getByText(text).first()).toBeHidden();
});

Then("session one should not be pinned", async ({ page }) => {
  const mock = getPageMock(page);
  expect(mock.state.conversations.find((conversation) => conversation.id === "one")?.pinned).toBe(
    false,
  );
});

When("they add the note {string}", async ({ page }, content: string) => {
  await page.getByPlaceholder("Add a note…").fill(content);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(content)).toBeVisible();
});

When("they edit the note {string} to {string}", async ({ page }, from: string, to: string) => {
  const note = page.getByRole("listitem").filter({ hasText: from });
  await note.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("listitem").getByRole("textbox").fill(to);
  await page.getByRole("listitem").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(to)).toBeVisible();
});

When("they search notes for {string}", async ({ page }, query: string) => {
  await page.getByPlaceholder("Search notes…").fill(query);
});

When("they clear the notes search", async ({ page }) => {
  await page.getByPlaceholder("Search notes…").fill("");
});

When("they delete the note {string}", async ({ page }, content: string) => {
  const note = page.getByRole("listitem").filter({ hasText: content });
  await note.getByRole("button", { name: "Delete" }).click();
});

Then("the note {string} should be visible", async ({ page }, content: string) => {
  await expect(page.getByText(content)).toBeVisible();
});

Then("the note {string} should not be visible", async ({ page }, content: string) => {
  await expect(page.getByText(content)).toHaveCount(0);
});

Then("the notes page should scroll to the last note", async ({ page }) => {
  const scrollRegion = page.getByTestId("app-scroll-region");
  const lastItem = page.getByText(
    "Scrollable note 39 with enough text to force overflow on the notes page.",
  );
  await expect(lastItem).toBeAttached();
  await expect(scrollRegion).toBeVisible();
  const metrics = await scrollRegion.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 1);
  await lastItem.scrollIntoViewIfNeeded();
  await expect(lastItem).toBeInViewport();
  const scrollTop = await scrollRegion.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
});

When("they save the memory {string}", async ({ page }, content: string) => {
  await page.getByPlaceholder("Save a memory…").fill(content);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Memory saved.")).toBeVisible();
});

When("they search memories for {string}", async ({ page }, query: string) => {
  await page.getByPlaceholder("Search memories…").fill(query);
});

When("they delete the memory {string}", async ({ page }, content: string) => {
  const memory = page.getByRole("listitem").filter({ hasText: content });
  await memory.getByRole("button", { name: "Delete" }).click();
});

Then("the memory {string} should be visible", async ({ page }, content: string) => {
  await expect(page.getByText(content)).toBeVisible();
});

Then("the memory {string} should not be visible", async ({ page }, content: string) => {
  await expect(page.getByText(content)).toHaveCount(0);
});

When("they edit the merged memory summary", async ({ page }) => {
  const summary = page.getByLabel("Merged memory summary");
  await summary.fill("The user prefers concise and recovery-aware guidance.");
  await page.getByRole("button", { name: "Save summary" }).click();
});

Then("the memory summary should be saved", async ({ page }) => {
  await expect(page.getByText("Memory summary saved.")).toBeVisible();
  await expect(page.getByLabel("Merged memory summary")).toHaveValue(
    "The user prefers concise and recovery-aware guidance.",
  );
});

Then("the memory page should scroll to the last memory", async ({ page }) => {
  const scrollRegion = page.getByTestId("app-scroll-region");
  const lastItem = page.getByText(
    "Scrollable memory 39 with enough text to force overflow on the memory page.",
  );
  await expect(lastItem).toBeAttached();
  await expect(scrollRegion).toBeVisible();
  const metrics = await scrollRegion.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 1);
  await lastItem.scrollIntoViewIfNeeded();
  await expect(lastItem).toBeInViewport();
  const scrollTop = await scrollRegion.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
});

When("they save the assistant message to memory", async ({ page }) => {
  await page.locator("#message-one-assistant").getByLabel("Save message to memory").click();
});

When("they remove the assistant message memories", async ({ page }) => {
  await page.locator("#message-one-assistant").getByLabel("Remove message memories").click();
});

When("they open the memory page", async ({ page }) => {
  await page.goto("/memory");
});

When("they open the auth page with an access denied error", async ({ page }) => {
  await page.goto("/auth?error=access_denied");
});

Then("the Google denial notice should be visible", async ({ page }) => {
  await expect(page.getByRole("alert").getByText(/Google account is not approved/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

Then("the guest start failure notice should be visible", async ({ page }) => {
  await expect(page.getByText("Guest session could not be started. Try again.")).toBeVisible();
});

When("they continue with Google", async ({ page }) => {
  await page.goto("/auth?next=/chat");
  await page.getByRole("button", { name: "Continue with Google" }).click();
});

When("they connect Hevy with the API key {string}", async ({ page }, apiKey: string) => {
  await page.getByPlaceholder("Hevy API key").fill(apiKey);
  await page.getByRole("button", { name: "Connect and sync" }).click();
});

Then("the Hevy connected status should be visible", async ({ page }) => {
  await expect(page.getByText(/Connected as Ada/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
});

When("they open the workouts page", async ({ page }) => {
  await page.getByRole("link", { name: "Workouts" }).click();
});

Then("the workout {string} should be visible", async ({ page }, title: string) => {
  await expect(page.getByText(title)).toBeVisible();
});

Then(
  "the exercise {string} should be visible after expanding the workout",
  async ({ page }, exercise: string) => {
    await page.getByRole("button", { name: `Expand E2E Push Day` }).click();
    await expect(page.getByText(exercise)).toBeVisible();
  },
);

When("they sync Hevy", async ({ page }) => {
  await page.getByRole("button", { name: "Sync now" }).click();
});

Then("the Hevy up-to-date status should be visible", async ({ page }) => {
  await expect(page.getByText(/Up to date/)).toBeVisible();
});

When("they disconnect Hevy after confirmation", async ({ page }) => {
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Disconnect" }).click();
});

Then("the Hevy disconnect notice should be visible", async ({ page }) => {
  await expect(page.getByText(/Hevy disconnected. Local history kept./)).toBeVisible();
  await expect(page.getByPlaceholder("Hevy API key")).toBeVisible();
});

When("they dismiss the Hevy disconnect confirmation", async ({ page }) => {
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Disconnect" }).click();
});

Then("the Hevy sync button should be visible", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
});

When("they remove Hevy cached data after confirmation", async ({ page }) => {
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Remove cached data…" }).click();
});

Then("the Hevy data removed notice should be visible", async ({ page }) => {
  await expect(page.getByText(/Hevy data removed/)).toBeVisible();
});

Then("the no workouts notice should be visible", async ({ page }) => {
  await expect(
    page.getByText("No workouts found. Upload a Hevy export to get started."),
  ).toBeVisible();
});

When("they generate a Discord link code", async ({ page }) => {
  await page.getByRole("button", { name: "Generate link code" }).click();
});

Then("the link code {string} should be visible", async ({ page }, code: string) => {
  await expect(page.getByText(code)).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke" })).toBeVisible();
});

When("they revoke the Discord link code", async ({ page }) => {
  await page.getByRole("button", { name: "Revoke" }).click();
});

Then("the revoke button should not be visible", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
});

When("they unlink the Discord account after confirmation", async ({ page }) => {
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Unlink" }).click();
});

Then(
  "the linked Discord account {string} should not be visible",
  async ({ page }, discordUserId: string) => {
    await expect(page.getByText(discordUserId)).toHaveCount(0);
  },
);

Then("the app version label should be visible", async ({ page }) => {
  const about = page.getByRole("region", { name: "App version" });
  await about.scrollIntoViewIfNeeded();
  await expect(about.getByRole("heading", { name: "App version" })).toBeVisible();
  await expect(page.getByTestId("app-version-label")).toHaveText(/v\d+\.\d+\.\d+/);
});

When("they check for updates", async ({ page }) => {
  await page.getByRole("button", { name: "Check for updates" }).click();
});

Then("the app update status should be visible", async ({ page }) => {
  await expect(page.getByTestId("app-update-status")).toBeVisible();
});

Then("the API key form should be visible", async ({ page }) => {
  await expect(page.getByText("Add your OpenAI API key")).toBeVisible();
});

Then("the message input should not be visible", async ({ page }) => {
  await expect(page.getByLabel("Message input")).toHaveCount(0);
});

When("they save the API key {string}", async ({ page }, apiKey: string) => {
  await page.getByLabel("OpenAI API key").fill(apiKey);
  await page.getByRole("button", { name: "Save key and start chatting" }).click();
});

const viewportMetrics = async (page: Page) => {
  const viewport = page.getByTestId("chat-thread-viewport");
  await expect(viewport).toBeVisible();
  return viewport.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    maxScrollTop: element.scrollHeight - element.clientHeight,
  }));
};

When("they scroll to a middle position and refresh the page", async ({ page }) => {
  const before = await viewportMetrics(page);
  expect(before.maxScrollTop).toBeGreaterThan(400);
  const targetScrollTop = Math.floor(before.maxScrollTop * 0.35);
  const storagePayload = JSON.stringify({
    "/chat/one": {
      '[data-scroll-restoration-id="chat-thread"]': {
        scrollX: 0,
        scrollY: targetScrollTop,
      },
    },
  });
  await page.getByTestId("chat-thread-viewport").evaluate(
    (element, { scrollTop, storageKey, payload }) => {
      element.scrollTop = scrollTop;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
      sessionStorage.setItem(storageKey, payload);
    },
    {
      scrollTop: targetScrollTop,
      storageKey: "tsr-scroll-restoration-v1_3",
      payload: storagePayload,
    },
  );
  await expect
    .poll(async () => (await viewportMetrics(page)).scrollTop)
    .toBeGreaterThan(targetScrollTop - 40);
  await page.reload();
  await expect(page.getByText("Session One assistant turn 9", { exact: true })).toBeVisible();
});

Then("the scroll position should be restored", async ({ page }) => {
  const before = await viewportMetrics(page);
  const targetScrollTop = Math.floor(before.maxScrollTop * 0.35);
  await expect
    .poll(async () => (await viewportMetrics(page)).scrollTop, { timeout: 10_000 })
    .toBeGreaterThan(targetScrollTop - 80);
  await expect
    .poll(async () => (await viewportMetrics(page)).scrollTop)
    .toBeLessThan(targetScrollTop + 80);
});

When("they scroll to the top and open session two", async ({ page }) => {
  await page.getByTestId("chat-thread-viewport").evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect.poll(async () => (await viewportMetrics(page)).scrollTop).toBeLessThan(40);
  await page.getByText("Session Two", { exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/two$/);
});

Then("session two should open at its newest messages", async ({ page }) => {
  await expect(page.getByText("Session Two assistant turn 9", { exact: true })).toBeVisible();
  const metrics = await viewportMetrics(page);
  expect(metrics.maxScrollTop).toBeGreaterThan(400);
  expect(metrics.scrollTop).toBeGreaterThan(metrics.maxScrollTop - 120);
});

When("they hover the second rail item", async ({ page }) => {
  await page.getByTestId("message-rail-item").nth(1).hover();
});

Then("the rail preview should show the second user turn", async ({ page }) => {
  const preview = page.getByTestId("message-rail-preview");
  await expect(preview).toContainText("Session One user turn 1");
  await expect(preview.locator("time")).toHaveAttribute("datetime", "2026-07-14T10:01:00.000Z");
});

When("they click the first rail item", async ({ page }) => {
  await page.getByTestId("message-rail-item").nth(0).click();
});

Then("the thread should scroll near the first user turn", async ({ page }) => {
  await expect.poll(async () => (await viewportMetrics(page)).scrollTop).toBeLessThan(200);
});

When("they open the message rail sheet", async ({ page }) => {
  await expect(page.getByTestId("message-rail-sheet-trigger")).toBeVisible();
  await page.getByTestId("message-rail-sheet-trigger").click();
});

Then("the rail sheet should list ten user turns", async ({ page }) => {
  const sheetItems = page.getByTestId("message-rail-sheet-item");
  await expect(sheetItems).toHaveCount(10);
  await expect(sheetItems.nth(1)).toContainText("Session One user turn 1");
  await expect(sheetItems.nth(1).locator("time")).toHaveAttribute(
    "datetime",
    "2026-07-14T10:01:00.000Z",
  );
});

When("they click the first rail sheet item", async ({ page }) => {
  await page.getByTestId("message-rail-sheet-item").nth(0).click();
  await expect(page.getByTestId("message-rail-sheet")).toBeHidden();
});

When("they click the previous user message button", async ({ page }) => {
  const metrics = await viewportMetrics(page);
  scrollPositions.set(page, { before: metrics.scrollTop });
  await page.getByTestId("scroll-to-previous-user-message").click();
});

Then("the thread should scroll above the previous position", async ({ page }) => {
  const stored = scrollPositions.get(page);
  if (stored === undefined) throw new Error("Previous scroll position is not initialized");
  await expect
    .poll(async () => {
      const metrics = await viewportMetrics(page);
      return metrics.scrollTop < stored.before - 80;
    })
    .toBe(true);
});

When("they click the scroll to top button", async ({ page }) => {
  await page.getByTestId("scroll-to-top").click();
});

Then("the thread should scroll to the top", async ({ page }) => {
  await expect.poll(async () => (await viewportMetrics(page)).scrollTop).toBeLessThan(40);
});

Then("the health overview heading should be visible", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Health overview" })).toBeVisible();
});

Then("the metric {string} should be visible", async ({ page }, label: string) => {
  await expect(page.getByText(label)).toBeVisible();
});

Then("the exercise {string} should be visible", async ({ page }, exercise: string) => {
  await expect(page.getByText(exercise)).toBeVisible();
});

When("they upload {string} and {string}", async ({ page }, health: string, hevy: string) => {
  await page.locator("#health").setInputFiles({
    name: health,
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await page.locator("#hevy").setInputFiles({
    name: hevy,
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\n1,2\n"),
  });
  await page.getByRole("button", { name: "Upload" }).click();
});

Then("the upload success notice should be visible", async ({ page }) => {
  await expect(page.getByText(/Uploaded!/)).toBeVisible();
  await expect(page.getByText(/Health: 1 daily/)).toBeVisible();
  await expect(page.getByText(/Hevy: 1 sessions, 2 sets/)).toBeVisible();
});

When("they reload the page with the API unreachable", async ({ page }) => {
  const mock = getPageMock(page);
  await page.unroute("**/api/**");
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/auth/get-session") {
      await fulfillMockApi({ route, app: mock.app });
      return;
    }
    await route.abort("internetdisconnected");
  });
  await page.reload();
});

When("they click the send button without a message", async ({ page }) => {
  await page.getByLabel("Send message").click();
});

Then("no chat request should have been made", async ({ page }) => {
  expect(getPageMock(page).state.chat.calls).toBe(0);
});

Then("the last request should contain a file part without a text part", async ({ page }) => {
  const parts = getPageMock(page).state.chat.lastBody?.messages?.[0]?.parts ?? [];
  expect(parts.some((part) => part.type === "file")).toBe(true);
  expect(parts.some((part) => part.type === "text")).toBe(false);
});

Then(
  "the last request should contain a file part named {string}",
  async ({ page }, filename: string) => {
    const parts = getPageMock(page).state.chat.lastBody?.messages?.[0]?.parts ?? [];
    const filePart = parts.find((part) => part.type === "file");
    expect(filePart?.filename).toBe(filename);
  },
);

Then(
  "the last request should contain a real image data URL for {string}",
  async ({ page }, filename: string) => {
    const parts = getPageMock(page).state.chat.lastBody?.messages?.[0]?.parts ?? [];
    const filePart = parts.find((part) => part.type === "file");
    expect(filePart?.filename).toBe(filename);
    expect(String(filePart?.url)).toMatch(/^data:image\//);
    expect(String(filePart?.url).length).toBeGreaterThan(50_000);
  },
);

Then("the last request should contain {int} file parts", async ({ page }, count: number) => {
  const parts = getPageMock(page).state.chat.lastBody?.messages?.[0]?.parts ?? [];
  expect(parts.filter((part) => part.type === "file")).toHaveLength(count);
});

When("they type {string} and press Enter", async ({ page }, text: string) => {
  const input = page.getByLabel("Message input");
  await input.fill(text);
  await input.press("Enter");
});

When("they type {string} and press Shift+Enter", async ({ page }, text: string) => {
  const input = page.getByLabel("Message input");
  await input.fill(text);
  await input.press("Shift+Enter");
});

When("they type the draft {string}", async ({ page }, draft: string) => {
  await page.getByLabel("Message input").fill(draft);
});

When("they go offline and type {string}", async ({ page }, draft: string) => {
  await page.context().setOffline(true);
  await page.getByLabel("Message input").fill(draft);
});

When("they come back online", async ({ page }) => {
  await page.context().setOffline(false);
});

Then("the message input should contain {string}", async ({ page }, text: string) => {
  await expect(page.getByLabel("Message input")).toHaveValue(text);
});

Then("the message input should be empty", async ({ page }) => {
  await expect(page.getByLabel("Message input")).toHaveValue("");
});

Then("the message input should keep Enter as a new line", async ({ page }) => {
  await expect(page.getByLabel("Message input")).toHaveValue("First line\n");
});

Then("the message input should contain a trailing newline", async ({ page }) => {
  await expect(page.getByLabel("Message input")).toHaveValue("Line one\n");
});

Then("the last request should enable web search", async ({ page }) => {
  expect(getPageMock(page).state.chat.lastBody?.webSearch).toBe(true);
});

Then("the last request should contain the text {string}", async ({ page }, text: string) => {
  const parts = getPageMock(page).state.chat.lastBody?.messages?.[0]?.parts ?? [];
  expect(parts.some((part) => part.type === "text" && part.text === text)).toBe(true);
});

Then("the last request should be temporary", async ({ page }) => {
  expect(getPageMock(page).state.chat.lastBody?.temporary).toBe(true);
});

Then("no conversation should have been created", async ({ page }) => {
  const mock = getPageMock(page);
  const created =
    (mock.state as MockApi["state"] & { createdConversationCount?: number })
      .createdConversationCount ?? 0;
  expect(created).toBe(0);
});

Then("no temporary conversation messages should have been fetched", async ({ page }) => {
  const mock = getPageMock(page);
  const fetches =
    (mock.state as MockApi["state"] & { temporaryMessageFetches?: string[] })
      .temporaryMessageFetches ?? [];
  expect(fetches.filter((id) => id.startsWith("temp_"))).toEqual([]);
});

When("they keep the temporary chat", async ({ page }) => {
  await page.getByRole("button", { name: /Keep/ }).click();
});

When("they edit the message {string} to {string}", async ({ page }, _from: string, to: string) => {
  await page.getByLabel("Edit message").first().click();
  await page.getByRole("textbox", { name: "Edit message" }).fill(to);
  await page.getByRole("button", { name: "Update" }).click();
});

When("they regenerate the last assistant response", async ({ page }) => {
  await page.getByLabel("Regenerate response").last().click();
});

When("they regenerate from the user message {string}", async ({ page }, _text: string) => {
  await page.locator("#message-one-user").getByLabel("Regenerate from this message").click();
});

When("they export the assistant message as markdown", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#message-one-assistant").getByLabel("Export message as Markdown").click();
  pageDownloads.set(page, await downloadPromise);
});

When("they open the reasoning section", async ({ page }) => {
  await page.getByText("Reasoning").click();
});

When("they click the referenced message link", async ({ page }) => {
  await page.getByText("Referenced message").click();
});

Then("the referenced user message should be in view", async ({ page }) => {
  await expect(page.locator("#message-one-user")).toBeInViewport();
});

Then("the metric label {string} should be visible", async ({ page }, label: string) => {
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
});

const toolDetails = (page: Page, toolName: string) =>
  page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: toolName }) })
    .first();

const toolInputDetails = (page: Page, toolName: string) =>
  toolDetails(page, toolName).locator("details").filter({ hasText: "Input" }).first();

When("they expand the input of {string}", async ({ page }, toolName: string) => {
  const tool = toolDetails(page, toolName);
  if (
    !(await tool.evaluate((element) =>
      element instanceof HTMLDetailsElement ? element.open : false,
    ))
  ) {
    await tool.locator("summary").first().click();
  }
  await toolInputDetails(page, toolName).locator("summary").click();
});

Then("the tool input of {string} should not be visible", async ({ page }, toolName: string) => {
  await expect(toolInputDetails(page, toolName).locator("pre").first()).toBeHidden();
});

Then("the tool input of {string} should be visible", async ({ page }, toolName: string) => {
  await expect(toolInputDetails(page, toolName).locator("pre").first()).toBeVisible();
});

Then("the recovery explanation {string} should be visible", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

When("they copy the conversation as markdown", async ({ page }) => {
  await page.getByLabel("Copy conversation as Markdown").click();
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
  await expect(page.locator('img[src^="data:image/"]')).toBeVisible();
});

Then("the session should no longer be archived", async ({ page }) => {
  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ hasText: /Session One/ })
    .first();
  await item.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await item.getByLabel("Session actions").click({ force: true });
  await expect(page.getByText("Archiver")).toBeVisible();
});

Then("the session should be archived", async ({ page }) => {
  const item = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ hasText: /Session One/ })
    .first();
  await item.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await item.getByLabel("Session actions").click({ force: true });
  await expect(page.getByText("Restaurer")).toBeVisible();
});

Then("they should see the status {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});
