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
  usage: null,
  model: null,
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
  it("shows pinned branches and jumps from search results to branch context", () => {
    const onFocus = vi.fn();
    const onSearch = vi.fn();

    render(
      <ThreadNavigation
        threads={[thread]}
        messages={[message]}
        focusedThreadId={null}
        searchQuery="squat"
        searchResults={[message]}
        onFocus={onFocus}
        onSearch={onSearch}
        onRename={vi.fn()}
        onPin={vi.fn()}
        onDiscard={vi.fn()}
        onRestore={vi.fn()}
        onSummarize={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Squat progression")).toHaveLength(2);
    expect(screen.getByText("Main › Squat progression")).toBeInTheDocument();

    fireEvent.click(screen.getByText("How should I improve my squat?"));

    expect(onFocus).toHaveBeenCalledWith("thread-1");
    expect(onSearch).toHaveBeenCalledWith("");
  });
});
