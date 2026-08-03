import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionFeedbackProvider, useActionFeedback } from "./action-feedback";

const FeedbackProbe = () => {
  const feedback = useActionFeedback();
  return (
    <button type="button" onClick={() => feedback.show({ kind: "success", message: "Saved." })}>
      show
    </button>
  );
};

describe("ActionFeedbackProvider", () => {
  afterEach(() => vi.useRealTimers());

  it("renders feedback and clears it after its lifecycle timeout", () => {
    vi.useFakeTimers();
    render(
      <ActionFeedbackProvider>
        <FeedbackProbe />
      </ActionFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "show" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
