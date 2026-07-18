import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageProvider } from "@/app/usage-context";
import type { MessageWithUsage } from "@/app/sessions";
import { chatModels } from "@/app/models";
import { useChatRuntime } from "@/app/chat/chat-runtime";
import { Thread, type ComposerControls } from "./thread";

vi.mock("@/app/chat/chat-runtime", () => ({ useChatRuntime: vi.fn() }));

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
      <UsageProvider messages={messages}>
        <Thread composerControls={controls} />
      </UsageProvider>
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
  });

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
