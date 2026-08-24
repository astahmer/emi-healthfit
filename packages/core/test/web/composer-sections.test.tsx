import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposerError, ComposerQueue } from "../../src/web/thread/composer-sections.tsx";

describe("ComposerQueue", () => {
  const baseItem = (overrides?: Partial<{ id: string; text: string; files: string[] }>) => ({
    id: "queue-1",
    text: "queued question",
    files: [],
    ...overrides,
  });

  const renderQueue = (
    overrides?: Partial<Parameters<typeof ComposerQueue>[0]>,
    items = [baseItem()],
  ) => {
    const props = {
      queuedFollowUps: items,
      editingQueuedId: null,
      beginEditingQueuedFollowUp: vi.fn(),
      forceSendQueued: vi.fn(),
      removeQueuedFollowUp: vi.fn(),
      clearQueuedFollowUps: vi.fn(),
      ...overrides,
    };
    render(<ComposerQueue {...props} />);
    return props;
  };

  it("labels the queue purpose and shows the pending count", () => {
    renderQueue(undefined, [baseItem(), baseItem({ id: "queue-2", text: "second" })]);

    const panel = screen.getByLabelText("Queued follow-ups");
    expect(panel).toHaveTextContent("Queued — sends after the current reply");
    expect(panel).toHaveTextContent("2 messages");
  });

  it("uses the singular count label for a single queued message", () => {
    renderQueue();

    const panel = screen.getByLabelText("Queued follow-ups");
    expect(panel).toHaveTextContent("1 message");
  });

  it("renders nothing when the queue is empty", () => {
    const { container } = render(
      <ComposerQueue
        queuedFollowUps={[]}
        editingQueuedId={null}
        beginEditingQueuedFollowUp={() => {}}
        forceSendQueued={() => {}}
        removeQueuedFollowUp={() => {}}
        clearQueuedFollowUps={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("numbers rows and describes attachment-only entries", () => {
    renderQueue(undefined, [
      baseItem({ text: "", files: ["a.png", "b.png"] }),
      baseItem({ id: "queue-2", text: "second" }),
    ]);

    expect(screen.getByText(/1\./)).toHaveTextContent("2 attachments");
    expect(screen.getByText(/2\./)).toHaveTextContent("second");
  });

  it("marks the row being edited", () => {
    renderQueue({ editingQueuedId: "queue-1" });

    expect(screen.getByText(/\(editing\)/)).toBeInTheDocument();
  });

  it("wires edit, send now, cancel, and clear actions", async () => {
    const props = renderQueue();

    fireEvent.click(screen.getByRole("button", { name: "Edit queued message 1" }));
    expect(props.beginEditingQueuedFollowUp).toHaveBeenCalledWith("queue-1");

    fireEvent.click(screen.getByRole("button", { name: "Send queued message 1 now" }));
    expect(props.forceSendQueued).toHaveBeenCalledWith("queue-1");

    fireEvent.click(screen.getByRole("button", { name: "Cancel queued message 1" }));
    expect(props.removeQueuedFollowUp).toHaveBeenCalledWith("queue-1");

    fireEvent.click(screen.getByRole("button", { name: "Clear queue" }));
    expect(props.clearQueuedFollowUps).toHaveBeenCalledOnce();
  });
});

describe("ComposerError", () => {
  const baseProps = {
    error: { message: "Request failed" },
    hasUserMessages: true,
    isRetrying: false,
    isStreaming: false,
    retryOrphan: vi.fn(),
    reviseLastTurn: vi.fn(),
    clearError: vi.fn(),
  };

  it("renders nothing without an error or when an error message is bound", () => {
    const { container } = render(<ComposerError {...baseProps} error={null} />);
    expect(container).toBeEmptyDOMElement();

    const bound = render(<ComposerError {...baseProps} errorMessageId="message-1" />);
    expect(bound.container).toBeEmptyDOMElement();
  });

  it("offers retry-last-turn for ordinary failures", () => {
    render(<ComposerError {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Retry last turn" }));
    expect(baseProps.reviseLastTurn).toHaveBeenCalledOnce();
  });

  it("offers orphan recovery instead when an orphan turn is pending", () => {
    render(<ComposerError {...baseProps} orphanMessageId="orphan-1" />);

    expect(screen.queryByRole("button", { name: "Retry last turn" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry previous request" }));
    expect(baseProps.retryOrphan).toHaveBeenCalledOnce();
  });

  it("disables retries while retrying or streaming", () => {
    render(<ComposerError {...baseProps} isRetrying />);

    expect(screen.getByRole("button", { name: /Retrying/ })).toBeDisabled();
  });

  it("dismisses the error", () => {
    render(<ComposerError {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(baseProps.clearError).toHaveBeenCalledOnce();
  });

  it("pushes dismiss to the end when no retry action exists", () => {
    render(<ComposerError {...baseProps} hasUserMessages={false} />);

    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveClass("ms-auto");
  });
});
