import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { writeChatThreadScrollY } from "@/lib/chat-thread-scroll";
import { useThreadViewportScroll } from "./use-thread-viewport-scroll";

const Harness = ({
  sessionId,
  messageCount,
  contentHeight = 2000,
}: {
  sessionId: string | undefined;
  messageCount: number;
  contentHeight?: number;
}) => {
  const { viewportRef, isAwayFromTop, scrollToTop } = useThreadViewportScroll({
    sessionId,
    messageCount,
  });

  return (
    <div>
      <div
        ref={(node) => {
          viewportRef.current = node;
          if (node === null) return;
          Object.defineProperty(node, "clientHeight", { configurable: true, value: 400 });
          Object.defineProperty(node, "scrollHeight", {
            configurable: true,
            value: contentHeight,
          });
        }}
        data-testid="viewport"
      />
      <output data-testid="away-from-top">{String(isAwayFromTop)}</output>
      <button type="button" onClick={scrollToTop}>
        top
      </button>
    </div>
  );
};

describe("useThreadViewportScroll", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("scrolls to bottom for a session without a restored position", () => {
    render(<Harness sessionId="one" messageCount={12} contentHeight={2400} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 2400);
  });

  it("restores a saved scroll position after messages arrive", () => {
    writeChatThreadScrollY({ sessionId: "one", scrollY: 640 });
    const { rerender } = render(<Harness sessionId="one" messageCount={0} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 0);

    rerender(<Harness sessionId="one" messageCount={12} contentHeight={2400} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 640);
  });

  it("scrolls to bottom when switching to another session", () => {
    writeChatThreadScrollY({ sessionId: "one", scrollY: 640 });
    const { rerender } = render(<Harness sessionId="one" messageCount={12} contentHeight={2400} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 640);

    rerender(<Harness sessionId="two" messageCount={12} contentHeight={3000} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 3000);
  });
});
