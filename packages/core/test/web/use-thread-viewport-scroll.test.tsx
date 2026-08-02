import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ChatThreadScroll } from "../../src/web/thread/chat-thread-scroll.ts";
import {
  ThreadViewportScroll,
  useThreadViewportScroll,
} from "../../src/web/thread/use-thread-viewport-scroll.ts";

const Harness = ({
  sessionId,
  messageCount,
  contentHeight = 2000,
  userMessageIds = [],
}: {
  sessionId: string | undefined;
  messageCount: number;
  contentHeight?: number;
  userMessageIds?: string[];
}) => {
  const {
    viewportRef,
    isAwayFromTop,
    canScrollToPreviousUserMessage,
    scrollToTop,
    scrollToPreviousUserMessage,
  } = useThreadViewportScroll({ sessionId, messageCount, userMessageIds });

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
      <output data-testid="can-prev-user">{String(canScrollToPreviousUserMessage)}</output>
      <button type="button" onClick={scrollToTop}>
        top
      </button>
      <button type="button" onClick={scrollToPreviousUserMessage}>
        prev-user
      </button>
    </div>
  );
};

describe("useThreadViewportScroll", () => {
  beforeEach(() => sessionStorage.clear());

  it("scrolls to bottom for a session without a restored position", () => {
    render(<Harness sessionId="one" messageCount={12} contentHeight={2400} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 2400);
  });

  it("restores a saved scroll position after messages arrive", () => {
    ChatThreadScroll.writeScrollY({ sessionId: "one", scrollY: 640 });
    const { rerender } = render(<Harness sessionId="one" messageCount={0} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 0);
    rerender(<Harness sessionId="one" messageCount={12} contentHeight={2400} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 640);
  });

  it("scrolls to bottom when switching to another session", () => {
    ChatThreadScroll.writeScrollY({ sessionId: "one", scrollY: 640 });
    const { rerender } = render(<Harness sessionId="one" messageCount={12} contentHeight={2400} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 640);
    rerender(<Harness sessionId="two" messageCount={12} contentHeight={3000} />);
    expect(screen.getByTestId("viewport")).toHaveProperty("scrollTop", 3000);
  });
});

describe("ThreadViewportScroll.findPreviousUserMessageId", () => {
  it("picks the nearest user message above the viewport top", () => {
    document.body.innerHTML = `
      <div id="viewport"></div>
      <div id="message-u1"></div>
      <div id="message-u2"></div>
      <div id="message-u3"></div>
    `;
    const viewport = document.getElementById("viewport")!;
    const u1 = document.getElementById("message-u1")!;
    const u2 = document.getElementById("message-u2")!;
    const u3 = document.getElementById("message-u3")!;
    viewport.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
    u1.getBoundingClientRect = () => ({ top: 10 } as DOMRect);
    u2.getBoundingClientRect = () => ({ top: 60 } as DOMRect);
    u3.getBoundingClientRect = () => ({ top: 200 } as DOMRect);

    expect(
      ThreadViewportScroll.findPreviousUserMessageId({
        viewport,
        messageIds: ["u1", "u2", "u3"],
      }),
    ).toBe("u2");
  });

  it("returns undefined when no user message is above the viewport", () => {
    document.body.innerHTML = '<div id="viewport"></div><div id="message-u1"></div>';
    const viewport = document.getElementById("viewport")!;
    const u1 = document.getElementById("message-u1")!;
    viewport.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
    u1.getBoundingClientRect = () => ({ top: 150 } as DOMRect);
    expect(ThreadViewportScroll.findPreviousUserMessageId({ viewport, messageIds: ["u1"] })).toBeUndefined();
  });
});
