import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { readChatThreadScrollY } from "@/lib/chat-thread-scroll";

const NEAR_BOTTOM_PX = 160;

const scrollToMessage = ({ messageId }: { messageId: string }) => {
  document.getElementById(`message-${messageId}`)?.scrollIntoView({
    behavior: "auto",
    block: "start",
  });
};

export const useThreadViewportScroll = ({
  sessionId,
  messageCount,
}: {
  sessionId: string | undefined;
  messageCount: number;
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const positionedForSessionRef = useRef<string | null>(null);
  const [isAwayFromTop, setIsAwayFromTop] = useState(false);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);

  const sessionKey = sessionId ?? "new";

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const needsInitialPosition = positionedForSessionRef.current !== sessionKey;
    if (needsInitialPosition) {
      if (messageCount === 0) {
        viewport.scrollTop = 0;
        setIsAwayFromTop(false);
        setIsAwayFromBottom(false);
        return;
      }

      const restoredScrollY = readChatThreadScrollY({ sessionId });
      viewport.scrollTop = restoredScrollY === undefined ? viewport.scrollHeight : restoredScrollY;
      positionedForSessionRef.current = sessionKey;
    } else if (messageCount > 0) {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (distanceFromBottom < NEAR_BOTTOM_PX) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setIsAwayFromTop(viewport.scrollTop > 24);
    setIsAwayFromBottom(distanceFromBottom > NEAR_BOTTOM_PX);
  }, [messageCount, sessionId, sessionKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const onScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setIsAwayFromTop(viewport.scrollTop > 24);
      setIsAwayFromBottom(distanceFromBottom > NEAR_BOTTOM_PX);
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [sessionKey]);

  const scrollToTop = () => {
    viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  };

  return {
    viewportRef,
    isAwayFromTop,
    isAwayFromBottom,
    scrollToTop,
    scrollToBottom,
    scrollToMessage,
  };
};
