import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
