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
          type: "dynamic-tool",
          toolName: "get_recovery",
          state: "output-available",
          output: { label: "Ready", explanation: "Recovered well" },
        },
      ],
      model: "gpt-5",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      createdAt: "2026-07-14T10:01:00.000Z",
    },
  ],
  threads: [],
});

export const assistantStream = ({ messageId, text }: { messageId: string; text: string }) =>
  [
    `data: {"type":"start","messageId":"${messageId}"}`,
    `data: {"type":"text-start","id":"${messageId}-text"}`,
    `data: {"type":"text-delta","id":"${messageId}-text","delta":"${text}"}`,
    `data: {"type":"text-end","id":"${messageId}-text"}`,
    'data: {"type":"finish"}',
    "data: [DONE]",
    "",
  ].join("\n\n");

export const multiToolStream = ({ messageId }: { messageId: string }) =>
  [
    `data: {"type":"start","messageId":"${messageId}"}`,
    `data: {"type":"tool-input-available","toolCallId":"call-1","toolName":"get_recovery","input":{}}`,
    `data: {"type":"tool-output-available","toolCallId":"call-1","output":{"label":"Ready","explanation":"Recovered well"}}`,
    `data: {"type":"tool-input-available","toolCallId":"call-2","toolName":"get_workout_history","input":{}}`,
    `data: {"type":"tool-output-error","toolCallId":"call-2","errorText":"Only one SELECT query is allowed."}`,
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

export const emptyAnalyticsOverview = {
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
