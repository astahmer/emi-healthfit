import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolFallback } from "./tool-fallback";

vi.mock("@assistant-ui/react", () => ({
  useScrollLock: () => () => {},
  useToolCallElapsed: () => undefined,
}));

const baseProps = {
  type: "tool-call" as const,
  toolCallId: "call-1",
  toolName: "get_workout_history",
  args: { limit: 10 },
  argsText: '{"limit":10}',
  addResult: vi.fn(),
  resume: vi.fn(),
  respondToApproval: vi.fn(),
};

describe("ToolFallback approval UI", () => {
  it("does not render approval buttons for a completed tool call", () => {
    render(<ToolFallback {...baseProps} status={{ type: "complete" }} addResult={vi.fn()} />);

    expect(screen.getByText(/Used tool:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /allow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });

  it("approves a tool that requires action", () => {
    const respondToApproval = vi.fn();

    render(
      <ToolFallback
        {...baseProps}
        status={{ type: "requires-action", reason: "interrupt" }}
        approval={{ id: "approval-1", options: [] }}
        respondToApproval={respondToApproval}
        addResult={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /allow/i }));
    expect(respondToApproval).toHaveBeenCalledWith({ approved: true });
  });

  it("denies a tool that requires action", () => {
    const respondToApproval = vi.fn();

    render(
      <ToolFallback
        {...baseProps}
        status={{ type: "requires-action", reason: "interrupt" }}
        approval={{ id: "approval-2", options: [] }}
        respondToApproval={respondToApproval}
        addResult={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /deny/i }));
    expect(respondToApproval).toHaveBeenCalledWith({ approved: false });
  });
});
