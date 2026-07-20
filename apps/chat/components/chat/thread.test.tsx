import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageProvider } from "@/app/usage-context";
import { ActionFeedbackProvider } from "@/app/action-feedback";
import type { MessageWithUsage } from "@/app/sessions";
import { chatModels } from "@/app/models";
import { useChatRuntime } from "@/app/chat/chat-runtime";
import { extractMemories } from "@/app/memories";
import { Thread, type ComposerControls } from "./thread";

vi.mock("@/app/chat/chat-runtime", () => ({ useChatRuntime: vi.fn() }));
vi.mock("@/app/memories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/memories")>()),
  extractMemories: vi.fn(),
}));

const controls: ComposerControls = {
  model: "gpt-5",
  onModelChange: vi.fn(),
  coachMode: false,
  onCoachModeChange: vi.fn(),
  webSearch: false,
  onWebSearchChange: vi.fn(),
  temporary: false,
  onTemporaryChange: vi.fn(),
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

describe("Thread", () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(useChatRuntime).mockReturnValue({
      messages: [],
      sessionId: "conversation-1",
      draft: "",
      files: [],
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
      clearError: vi.fn(),
      orphanMessageId: undefined,
      retryOrphan: vi.fn(),
    });
  });

  it("announces streaming and shows the delayed-response typing indicator", () => {
    const message: MessageWithUsage = { id: "assistant-1", role: "assistant", parts: [] };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
      isStreaming: true,
    });

    renderThread([message]);

    expect(screen.getByText("Assistant is responding")).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant is working")).toBeInTheDocument();
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

  it("does not animate an unfinished tool after message streaming has ended", () => {
    const message: MessageWithUsage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "query_database",
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

    expect(screen.getByText("query database")).toBeInTheDocument();
    expect(view.container.querySelector(".animate-spin")).toBeNull();
  });

  it("renders persisted error-text outcomes as Failed after refresh", () => {
    const failedToolPart = JSON.parse(
      JSON.stringify({
        type: "dynamic-tool",
        toolName: "query_database",
        toolCallId: "tool-failed",
        state: "output-error",
        input: {},
        output: { type: "error-text", value: "Only one SELECT query is allowed." },
      }),
    );
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
      model: "gpt-5",
      createdAt: "2026-07-14T10:00:00.000Z",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
    vi.mocked(useChatRuntime).mockReturnValue({
      ...vi.mocked(useChatRuntime)(),
      messages: [message],
    });

    const view = renderThread([message]);

    expect(screen.getAllByText("GPT-5").length).toBeGreaterThan(0);
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
    vi.mocked(extractMemories).mockResolvedValue([]);
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
