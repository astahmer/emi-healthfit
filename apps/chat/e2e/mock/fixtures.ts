export const conversations = [
  {
    id: "one",
    title: "Session One",
    status: "regular" as const,
    pinned: false,
    created_at: "2026-07-14T10:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z",
  },
  {
    id: "two",
    title: "Session Two",
    status: "regular" as const,
    pinned: false,
    created_at: "2026-07-14T09:00:00.000Z",
    updated_at: "2026-07-14T11:00:00.000Z",
  },
];

export const conversationPayload = ({ id, text }: { id: string; text: string }) => ({
  conversation: conversations.find((conversation) => conversation.id === id),
  messages: [
    {
      id: `${id}-user`,
      conversationId: id,
      parentId: null,
      role: "user",
      parts: [{ type: "text", text }],
      createdAt: "2026-07-14T10:00:00.000Z",
    },
    {
      id: `${id}-assistant`,
      conversationId: id,
      parentId: null,
      role: "assistant",
      parts: [
        { type: "text", text: `${text} answer` },
        {
          type: "tool-invocation",
          toolName: "get_recovery",
          toolCallId: "recovery-1",
          state: "output-available",
          input: {},
          output: { label: "Ready", explanation: "Recovered well" },
        },
      ],
      model: "gpt-5.6-terra",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      createdAt: "2026-07-14T10:01:00.000Z",
    },
  ],
  threads: [],
});

export const assistantStream = ({ messageId, text }: { messageId: string; text: string }) =>
  [
    `data: {"type":"start","messageId":"${messageId}"}`,
    'data: {"type":"start-step"}',
    `data: {"type":"text-start","id":"${messageId}-text"}`,
    `data: {"type":"text-delta","id":"${messageId}-text","delta":"${text}"}`,
    `data: {"type":"text-end","id":"${messageId}-text"}`,
    'data: {"type":"finish-step"}',
    'data: {"type":"finish"}',
    "data: [DONE]",
    "",
  ].join("\n\n");

export const multiToolStream = ({ messageId }: { messageId: string }) =>
  [
    `data: {"type":"start","messageId":"${messageId}"}`,
    'data: {"type":"start-step"}',
    `data: {"type":"tool-input-available","toolCallId":"call-1","toolName":"get_recovery","input":{}}`,
    `data: {"type":"tool-output-available","toolCallId":"call-1","output":{"label":"Ready","explanation":"Recovered well"}}`,
    `data: {"type":"tool-input-available","toolCallId":"call-2","toolName":"get_workout_history","input":{}}`,
    `data: {"type":"tool-output-error","toolCallId":"call-2","errorText":"Only one SELECT query is allowed."}`,
    'data: {"type":"finish-step"}',
    `data: {"type":"text-start","id":"${messageId}-text"}`,
    `data: {"type":"text-delta","id":"${messageId}-text","delta":"Mixed tools done"}`,
    `data: {"type":"text-end","id":"${messageId}-text"}`,
    'data: {"type":"finish"}',
    "data: [DONE]",
    "",
  ].join("\n\n");

export const authSessionBody = {
  session: {
    id: "test-session",
    token: "test-token",
    userId: "test-user",
    expiresAt: "2026-07-18T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  },
  user: {
    id: "test-user",
    name: "Guest",
    email: "8c75583b-0b8d-4bda-97e4-6cd7286f1378@anonymous.emi.invalid",
    emailVerified: false,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  },
};

export type MockAnalyticsOverview = {
  days: number;
  activity: Array<{
    date: string;
    steps: number | null;
    active_kcal: number | null;
    exercise_min: number | null;
  }>;
  sleep: Array<{
    date: string;
    asleep_min: number | null;
    in_bed_min: number | null;
  }>;
  training: Array<{
    date: string;
    workouts: number;
    volume_kg: number | null;
    duration_sec: number | null;
  }>;
  body: Array<{
    date: string;
    weight_kg: number | null;
    body_fat_pct: number | null;
    lean_mass_kg: number | null;
  }>;
  exercises: Array<{
    exercise_title: string;
    sets: number;
    volume_kg: number;
  }>;
  highlights: {
    averageSteps: number | null;
    averageSleepMinutes: number | null;
    workouts: number;
    trainingVolumeKg: number;
    weightChangeKg: number | null;
  };
};

export const emptyAnalyticsOverview: MockAnalyticsOverview = {
  days: 90,
  activity: [],
  sleep: [],
  training: [],
  body: [],
  exercises: [],
  highlights: {
    averageSteps: null,
    averageSleepMinutes: null,
    workouts: 0,
    trainingVolumeKg: 0,
    weightChangeKg: null,
  },
};
