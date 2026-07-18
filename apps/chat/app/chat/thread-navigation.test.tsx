import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadNavigation } from "./thread-navigation";
import type { MessageNode, ThreadView } from "./conversation-machine";

const message: MessageNode = {
  id: "message-1",
  conversationId: "conversation-1",
  parentId: null,
  role: "user",
  parts: [{ type: "text", text: "How should I improve my squat?" }],
  createdAt: "2026-07-14T10:00:00.000Z",
};

const thread: ThreadView = {
  id: "thread-1",
  conversationId: "conversation-1",
  anchorMessageId: "message-1",
  title: "Squat progression",
  status: "regular",
  pinned: true,
  messageIds: ["message-1"],
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z",
};

describe("ThreadNavigation", () => {
  it("stays hidden until the conversation has a branch", () => {
    const view = render(
      <ThreadNavigation
        threads={[]}
        focusedThreadId={null}
        searchQuery=""
        searchResults={[]}
        onFocus={vi.fn()}
        onSearch={vi.fn()}
        onRename={vi.fn()}
        onPin={vi.fn()}
        onDiscard={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(view.container).toBeEmptyDOMElement();
  });

  it("shows pinned branches and jumps from search results to branch context", () => {
    const onFocus = vi.fn();
    const onSearch = vi.fn();

    render(
      <ThreadNavigation
        threads={[thread]}
        focusedThreadId={null}
        searchQuery="squat"
        searchResults={[message]}
        onFocus={onFocus}
        onSearch={onSearch}
        onRename={vi.fn()}
        onPin={vi.fn()}
        onDiscard={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByText("Squat progression")).toBeInTheDocument();
    expect(screen.getByText("Main › Squat progression")).toBeInTheDocument();

    fireEvent.click(screen.getByText("How should I improve my squat?"));

    expect(onFocus).toHaveBeenCalledWith("thread-1");
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("uses an immutable creation timestamp instead of visible-list indexes", () => {
    render(
      <ThreadNavigation
        threads={[
          { ...thread, id: "thread-3", title: null },
          { ...thread, id: "thread-1", title: null, status: "discarded" },
        ]}
        focusedThreadId={null}
        searchQuery=""
        searchResults={[]}
        onFocus={vi.fn()}
        onSearch={vi.fn()}
        onRename={vi.fn()}
        onPin={vi.fn()}
        onDiscard={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Branch from/).length).toBeGreaterThan(0);
  });
});
