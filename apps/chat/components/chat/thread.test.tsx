import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageProvider } from "@/app/usage-context";
import { ActionFeedbackProvider } from "@/app/action-feedback";
import type { MessageWithUsage } from "@/app/sessions";
import { chatModels } from "@/app/models";
import { useChatRuntime } from "@/app/chat/chat-runtime-context";
import { MemoryDomain } from "@/app/memories";
import { Thread, type ComposerControls } from "./thread";

vi.mock("@/app/chat/chat-runtime-context", () => ({ useChatRuntime: vi.fn() }));
vi.mock("@/app/memories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/memories")>()),
  MemoryDomain: {
    ...(await importOriginal<typeof import("@/app/memories")>()).MemoryDomain,
    extract: vi.fn(),
  },
}));

const controls: ComposerControls = {
  model: "gpt-5.6-terra",
  onModelChange: vi.fn(),
  coachMode: false,
  onCoachModeChange: vi.fn(),
  webSearch: false,
  onWebSearchChange: vi.fn(),
  temporary: false,
  onTemporaryChange: vi.fn(),
  onKeepTemporary: vi.fn(),
  models: chatModels,
  canWebSearch: true,
};

const renderThread = (messages: MessageWithUsage[]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ActionFeedbackProvider>
        <UsageProvider messages={messages}>
          <Thread composerControls={controls} />
        </UsageProvider>
      </ActionFeedbackProvider>
    </QueryClientProvider>,
  );

const createMatchMediaResult = ({
  media,
  matches,
}: {
  media: string;
  matches: boolean;
}): MediaQueryList => ({
  matches,
  media,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

describe("Thread", () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(useChatRuntime).mockReturnValue({
      messages: [],
      sessionId: "conversation-1",
      draft: "",
      files: [],
      queuedFollowUps: [],
      editingQueuedId: null,
      isStreaming: false,
      error: null,
      errorMessageId: undefined,
      attachmentError: null,
      isPreparingAttachments: false,
      setDraft: vi.fn(),
      addFiles: vi.fn(),
      removeFile: vi.fn(),
      submit: vi.fn(),
      revise: vi.fn(),
      stop: vi.fn(),
      removeQueuedFollowUp: vi.fn(),
      clearQueuedFollowUps: vi.fn(),
      forceSendQueued: vi.fn(),
      beginEditingQueuedFollowUp: vi.fn(),
      clearQueuedFollowUpEdit: vi.fn(),
      clearError: vi.fn(),
      orphanMessageId: undefined,
      retryOrphan: vi.fn(),
      isRetrying: false,
    });
  });

  it("shows queued follow-ups with edit, send now, and cancel actions", () => {
    const removeQueuedFollowUp = vi.fn();
    const forceSendQueued = vi.fn();
    const beginEditingQueuedFollowUp = vi.fn();
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      isStreaming: true,
      queuedFollowUps: [
        { id: "q1", text: "Ask about sleep next", files: [] },
        { id: "q2", text: "Then recovery", files: [] },
      ],
      removeQueuedFollowUp,
      forceSendQueued,
      beginEditingQueuedFollowUp,
    });

    renderThread([]);

    expect(screen.getByLabelText("Queued follow-ups")).toBeInTheDocument();
    expect(screen.getByText(/Ask about sleep next/)).toBeInTheDocument();
    expect(screen.getByText(/Then recovery/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Edit queued message 1"));
    expect(beginEditingQueuedFollowUp).toHaveBeenCalledWith("q1");
    fireEvent.click(screen.getByLabelText("Send queued message 2 now"));
    expect(forceSendQueued).toHaveBeenCalledWith("q2");
    fireEvent.click(screen.getByLabelText("Cancel queued message 1"));
    expect(removeQueuedFollowUp).toHaveBeenCalledWith("q1");
  });

  it("announces streaming and shows the live response indicator", () => {
    const message: MessageWithUsage = { id: "assistant-1", role: "assistant", parts: [] };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      isStreaming: true,
    });

    renderThread([message]);

    expect(screen.getByText("Assistant is responding")).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant is working")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("does not render an empty completed assistant message", () => {
    const message: MessageWithUsage = { id: "assistant-empty", role: "assistant", parts: [] };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
    });

    renderThread([message]);

    expect(document.querySelector("#message-assistant-empty")).toBeNull();
  });

  it("shows the typing indicator before the first assistant chunk arrives", () => {
    const message: MessageWithUsage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Question" }],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      isStreaming: true,
    });

    renderThread([message]);

    expect(screen.getByLabelText("Assistant is working")).toBeInTheDocument();
  });

  it("keeps the live response indicator at the end of streamed content", () => {
    const message: MessageWithUsage = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Partial answer" }],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      isStreaming: true,
    });

    renderThread([message]);

    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant is working")).toBeInTheDocument();
  });

  it("does not animate an unfinished tool after message streaming has ended", () => {
    const message: MessageWithUsage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "get_workout_history",
          toolCallId: "tool-1",
          state: "input-available",
          input: {},
        },
      ],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      isStreaming: false,
    });

    const view = renderThread([message]);

    expect(screen.getByText("get workout history")).toBeInTheDocument();
    expect(view.container.querySelector(".animate-spin")).toBeNull();
  });

  it("renders persisted error-text outcomes as Failed after refresh", () => {
    const failedToolPart = {
      type: "dynamic-tool",
      toolName: "get_workout_history",
      toolCallId: "tool-failed",
      state: "output-available",
      input: {},
      output: { type: "error-text", value: "Only one SELECT query is allowed." },
    } satisfies MessageWithUsage["parts"][number];
    const message: MessageWithUsage = {
      id: "assistant-failed",
      role: "assistant",
      parts: [failedToolPart],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      isStreaming: false,
    });

    renderThread([message]);

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Only one SELECT query is allowed.")).toBeInTheDocument();
  });

  it("restores persisted timestamp, model, and token metadata", () => {
    const message: MessageWithUsage = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Progress" }],
      model: "gpt-5.6-terra",
      createdAt: "2026-07-14T10:00:00.000Z",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
    });

    const view = renderThread([message]);

    expect(screen.getAllByText("GPT-5.6 Terra").length).toBeGreaterThan(0);
    expect(screen.getByText("30 tokens")).toBeInTheDocument();
    expect(view.container.querySelector("time")).toHaveAttribute("datetime", message.createdAt);
  });

  it("previews image attachments before submission", () => {
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      files: [
        {
          type: "file",
          mediaType: "image/png",
          filename: "chart.png",
          url: "data:image/png;base64,AA==",
        },
      ],
    });

    const view = renderThread([]);

    expect(screen.getByText("chart.png")).toBeInTheDocument();
    expect(view.container.querySelector('img[src="data:image/png;base64,AA=="]')).not.toBeNull();
  });

  it("adds images pasted into the message input", () => {
    const addFiles = vi.fn();
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      addFiles,
    });
    renderThread([]);
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const files = [image];

    fireEvent.paste(screen.getByLabelText("Message input"), {
      clipboardData: { files },
    });

    expect(addFiles).toHaveBeenCalledWith(files);
  });

  it("submits Enter on desktop", () => {
    const runtime = vi.mocked(useChatRuntime)();
    renderThread([]);

    fireEvent.keyDown(screen.getByLabelText("Message input"), {
      key: "Enter",
      code: "Enter",
    });

    expect(runtime.submit).toHaveBeenCalledOnce();
  });

  it("keeps Enter available for a new line on mobile", () => {
    const matchMedia = vi.mocked(window.matchMedia);
    matchMedia.mockImplementation((query) =>
      createMatchMediaResult({ media: query, matches: query === "(max-width: 767px)" }),
    );

    try {
      const runtime = vi.mocked(useChatRuntime)();
      renderThread([]);
      const input = screen.getByLabelText("Message input");
      const keyDown = createEvent.keyDown(input, { key: "Enter", code: "Enter" });

      fireEvent(input, keyDown);

      expect(keyDown.defaultPrevented).toBe(false);
      expect(runtime.submit).not.toHaveBeenCalled();
    } finally {
      matchMedia.mockImplementation((query) =>
        createMatchMediaResult({ media: query, matches: false }),
      );
    }
  });

  it("edits a user turn through the XState-owned editor", async () => {
    const user = userEvent.setup();
    const message: MessageWithUsage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Original" }],
    };
    const runtime = vi.mocked(useChatRuntime)();
    vi.mocked(useChatRuntime).mockReturnValue({ ...runtime, messages: [message] });
    renderThread([message]);

    await user.click(screen.getByLabelText("Edit message"));
    const editor = screen.getByLabelText("Edit message");
    await user.clear(editor);
    await user.type(editor, "Edited");
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(runtime.revise).toHaveBeenCalledWith({ messageId: "user-1", text: "Edited" });
  }, 15_000);

  it("cancels an edit with Escape", async () => {
    const user = userEvent.setup();
    const message: MessageWithUsage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Original" }],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
    });
    renderThread([message]);

    await user.click(screen.getByLabelText("Edit message"));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
    expect(vi.mocked(useChatRuntime)().revise).not.toHaveBeenCalled();
  }, 15_000);

  it("copies a message and confirms the action", async () => {
    const user = userEvent.setup();
    const message: MessageWithUsage = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Answer" }],
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
    });
    renderThread([message]);

    await user.click(screen.getByLabelText("Copy message"));

    expect(writeText).toHaveBeenCalledWith("Answer");
    expect(screen.getByRole("status")).toHaveTextContent("Message copied.");
  }, 15_000);

  it("attaches a retry action to the failed user turn", async () => {
    const user = userEvent.setup();
    const retryError = new Error("Generation timed out");
    const message: MessageWithUsage = {
      id: "user-failed",
      role: "user",
      parts: [{ type: "text", text: "Question" }],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      error: retryError,
      errorMessageId: message.id,
    });
    const view = renderThread([message]);

    await user.click(view.getByRole("button", { name: "Retry this request" }));

    expect(vi.mocked(useChatRuntime)().revise).toHaveBeenCalledWith({ messageId: message.id });
  });

  it("disables retry while a retry is already in flight", () => {
    const message: MessageWithUsage = {
      id: "user-failed",
      role: "user",
      parts: [{ type: "text", text: "Question" }],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      error: new Error("Generation timed out"),
      errorMessageId: message.id,
      isRetrying: true,
    });

    renderThread([message]);

    expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
  });

  it("shows Send after reply instead of Stop when drafting during an in-flight generation", () => {
    const message: MessageWithUsage = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Working…" }],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      isStreaming: true,
      draft: "interrupt with this",
    });

    renderThread([message]);

    expect(screen.getByLabelText("Send after reply")).toBeInTheDocument();
    expect(screen.queryByLabelText("Stop generating")).not.toBeInTheDocument();
  });

  it("shows composer retry-last-turn and dismiss when error is not bound to a message", async () => {
    const user = userEvent.setup();
    const clearError = vi.fn();
    const revise = vi.fn();
    const message: MessageWithUsage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Question" }],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      error: new Error("Upstream failed"),
      errorMessageId: undefined,
      clearError,
      revise,
    });
    renderThread([message]);

    expect(screen.getByText("Upstream failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry last turn" }));
    expect(revise).toHaveBeenCalledWith({ messageId: message.id });
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(clearError).toHaveBeenCalled();
  });

  it("confirms when an assistant message has no new memories", async () => {
    const user = userEvent.setup();
    vi.mocked(MemoryDomain.extract).mockResolvedValue([]);
    const message: MessageWithUsage = {
      id: "assistant-empty-memory",
      role: "assistant",
      parts: [{ type: "text", text: "Nothing durable here." }],
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
    });
    renderThread([message]);

    await user.click(screen.getByLabelText("Save message to memory"));

    expect(screen.getByRole("status")).toHaveTextContent("Nothing new to save to memory.");
  });

  it("regenerates an assistant turn", async () => {
    const user = userEvent.setup();
    const messages: MessageWithUsage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Question" }] },
      { id: "assistant-1", role: "assistant", parts: [{ type: "text", text: "Answer" }] },
    ];
    const runtime = vi.mocked(useChatRuntime)();
    vi.mocked(useChatRuntime).mockReturnValue({ ...runtime, messages });
    renderThread(messages);

    await user.click(screen.getByLabelText("Regenerate response"));

    expect(runtime.revise).toHaveBeenCalledWith({ messageId: "assistant-1" });
  });
});
