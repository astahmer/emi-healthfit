import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryMocks = vi.hoisted(() => ({
  extract: vi.fn(),
  notify: vi.fn(),
  runApi: vi.fn(),
}));

vi.mock("../memories", () => ({ MemoryDomain: { extract: memoryMocks.extract } }));
vi.mock("../memory-events", () => ({ notifyMemoriesChanged: memoryMocks.notify }));
vi.mock("../api-client", () => ({ runApi: memoryMocks.runApi }));

import type { ChatMessage } from "@emi/core/protocol";
import {
  createHealthFitConversationClient,
  extractHealthFitAssistantMemories,
} from "./healthfit-chat-adapter";

const assistantMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    { type: "reasoning", text: "Internal reasoning." },
    { type: "text", text: "First sentence." },
    { type: "text", text: "Second sentence." },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("HealthFit completed-message adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryMocks.extract.mockResolvedValue(["memory-1"]);
    memoryMocks.runApi.mockReset();
  });

  it("extracts only completed assistant text and invalidates memory queries", async () => {
    await extractHealthFitAssistantMemories({
      conversationId: "conversation-1",
      message: assistantMessage,
      temporary: false,
      apiKey: "test-key",
      baseUrl: "https://api.example",
      model: "test-model",
    });

    expect(memoryMocks.extract).toHaveBeenCalledWith({
      text: "First sentence.\nSecond sentence.",
      threadId: "conversation-1",
      messageId: "assistant-1",
      source: "auto",
      config: {
        apiKey: "test-key",
        baseUrl: "https://api.example",
        model: "test-model",
      },
    });
    expect(memoryMocks.notify).toHaveBeenCalledOnce();
  });

  it("skips temporary and textless completions", async () => {
    await extractHealthFitAssistantMemories({
      conversationId: "conversation-1",
      message: assistantMessage,
      temporary: true,
      apiKey: "test-key",
      baseUrl: "",
      model: "test-model",
    });
    await extractHealthFitAssistantMemories({
      conversationId: "conversation-1",
      message: {
        ...assistantMessage,
        parts: [{ type: "reasoning", text: "No user-facing text." }],
      },
      temporary: false,
      apiKey: "test-key",
      baseUrl: "",
      model: "test-model",
    });

    expect(memoryMocks.extract).not.toHaveBeenCalled();
    expect(memoryMocks.notify).not.toHaveBeenCalled();
  });

  it("maps revised protocol parts to the HealthFit API client", async () => {
    const reviseMessage = vi.fn().mockResolvedValue({ ok: true });
    memoryMocks.runApi.mockImplementation(async (useClient) =>
      useClient({ conversations: { reviseMessage } }),
    );
    const client = createHealthFitConversationClient();

    await client.reviseConversationMessage({
      conversationId: "conversation-1",
      messageId: "message-1",
      parts: [{ type: "text", text: "Revised" }],
      threadId: "thread-1",
    });

    expect(reviseMessage).toHaveBeenCalledWith({
      params: { id: "conversation-1", messageId: "message-1" },
      payload: {
        parts: [{ type: "text", text: "Revised" }],
        threadId: "thread-1",
      },
    });
  });
});
