import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThreadMessage } from "../../src/web/thread/thread-message.tsx";

const summaryMessage = {
  id: "summary-1",
  role: "summary" as const,
  parts: [
    {
      type: "text" as const,
      text: "Use this compacted summary of the previous conversation as context:\nPrior workout notes.",
    },
  ],
};

describe("ThreadMessage summary rendering", () => {
  it("renders a summary message as an open collapsible block with visible text", () => {
    render(<ThreadMessage message={summaryMessage} isStreaming={false} />);

    const block = screen.getByTestId("compacted-summary");
    expect(block).toHaveAttribute("open");
    expect(screen.getByText("Context compacted")).toBeTruthy();
    expect(screen.getByText(/Prior workout notes\./)).toBeTruthy();
    expect(screen.queryByText(/Use this compacted summary/)).toBeNull();
  });

  it("collapses the summary block when the label is clicked", async () => {
    const user = userEvent.setup();
    render(<ThreadMessage message={summaryMessage} isStreaming={false} />);

    const block = screen.getByTestId("compacted-summary");
    await user.click(screen.getByText("Context compacted"));
    expect(block).not.toHaveAttribute("open");
  });
});

describe("ThreadMessage action wall and model identity", () => {
  const assistantMessage = {
    id: "assistant-1",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "Here is your answer." }],
  };

  it("labels the historical model with Replied-with wording", () => {
    render(
      <ThreadMessage
        message={assistantMessage}
        isStreaming={false}
        metadata={{ modelLabel: "GPT-5.6 Terra" }}
      />,
    );

    expect(screen.getByText("Replied with GPT-5.6 Terra")).toBeTruthy();
    expect(screen.queryByText("GPT-5.6 Terra")).toBeNull();
  });

  it("moves save-to-memory and export into the More actions menu", async () => {
    const user = userEvent.setup();
    const onRemember = vi.fn();
    render(
      <ThreadMessage
        message={assistantMessage}
        isStreaming={false}
        onRemember={onRemember}
      />,
    );

    const menu = screen.getByLabelText("More actions").closest("details");
    expect(menu).not.toHaveAttribute("open");

    await user.click(screen.getByLabelText("More actions"));
    expect(menu).toHaveAttribute("open");

    const save = screen.getByRole("button", { name: "Save message to memory" });
    expect(save.className).toContain("min-h-10");
    await user.click(save);
    expect(onRemember).toHaveBeenCalledTimes(1);
    expect(menu).not.toHaveAttribute("open");

    await user.click(screen.getByLabelText("More actions"));
    expect(
      screen.getByRole("button", { name: "Export message as Markdown" }),
    ).toBeTruthy();
  });

  it("gives footer action buttons 40px touch hit areas", () => {
    render(
      <ThreadMessage
        message={assistantMessage}
        isStreaming={false}
        onCopyResult={() => undefined}
      />,
    );

    const copy = screen.getByLabelText("Copy message");
    expect(copy.className).toContain("size-10");
  });

  it("raises the thinking indicator above muted contrast with a pulse", () => {
    render(<ThreadMessage message={assistantMessage} isStreaming />);

    const status = screen.getByRole("status", { name: "Assistant is working" });
    expect(status.className).toContain("animate-pulse");
    expect(status.className).toContain("text-foreground/80");
  });
});
