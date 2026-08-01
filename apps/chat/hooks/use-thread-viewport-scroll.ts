import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { readChatThreadScrollY } from "@/lib/chat-thread-scroll";

const NEAR_BOTTOM_PX = 160;
const PREV_USER_MARGIN_PX = 24;
const emptyUserMessageIds: readonly string[] = [];

export const scrollToMessage = ({ messageId }: { messageId: string }) => {
  document.getElementById(`message-${messageId}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
};

export const findPreviousUserMessageId = ({
  viewport,
  messageIds,
}: {
  viewport: HTMLElement;
  messageIds: readonly string[];
}): string | undefined => {
  const viewportTop = viewport.getBoundingClientRect().top + PREV_USER_MARGIN_PX;
  let nearestId: string | undefined;
  let nearestTop = Number.NEGATIVE_INFINITY;

  for (const messageId of messageIds) {
    const element = document.getElementById(`message-${messageId}`);
    if (element === null) continue;
    const top = element.getBoundingClientRect().top;
    if (top >= viewportTop - 1) continue;
    if (top <= nearestTop) continue;
    nearestTop = top;
    nearestId = messageId;
  }

  return nearestId;
};

export const useThreadViewportScroll = ({
  sessionId,
  messageCount,
  userMessageIds = emptyUserMessageIds,
}: {
  sessionId: string | undefined;
  messageCount: number;
  userMessageIds?: readonly string[];
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const positionedForSessionRef = useRef<string | null>(null);
  const userMessageIdsRef = useRef(userMessageIds);
  const userMessageIdsKey = userMessageIds.join("\0");
  const [isAwayFromTop, setIsAwayFromTop] = useState(false);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [canScrollToPreviousUserMessage, setCanScrollToPreviousUserMessage] = useState(false);

  const sessionKey = sessionId ?? "new";

  useLayoutEffect(() => {
    userMessageIdsRef.current = userMessageIds;
  }, [userMessageIds]);

  const updateScrollFlags = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setIsAwayFromTop(viewport.scrollTop > 24);
    setIsAwayFromBottom(distanceFromBottom > NEAR_BOTTOM_PX);
    setCanScrollToPreviousUserMessage(
      findPreviousUserMessageId({
        viewport,
        messageIds: userMessageIdsRef.current,
      }) !== undefined,
    );
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const needsInitialPosition = positionedForSessionRef.current !== sessionKey;
    if (needsInitialPosition) {
      if (messageCount === 0) {
        viewport.scrollTop = 0;
        setIsAwayFromTop(false);
        setIsAwayFromBottom(false);
        setCanScrollToPreviousUserMessage(false);
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

    updateScrollFlags();
  }, [messageCount, sessionId, sessionKey, updateScrollFlags]);

  useLayoutEffect(() => {
    updateScrollFlags();
  }, [userMessageIdsKey, updateScrollFlags]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const onScroll = () => {
      updateScrollFlags();
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [sessionKey, updateScrollFlags]);

  const scrollToTop = () => {
    viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  };

  const scrollToPreviousUserMessage = () => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const messageId = findPreviousUserMessageId({
      viewport,
      messageIds: userMessageIdsRef.current,
    });
    if (messageId === undefined) return;
    scrollToMessage({ messageId });
  };

  return {
    viewportRef,
    isAwayFromTop,
    isAwayFromBottom,
    canScrollToPreviousUserMessage,
    scrollToTop,
    scrollToBottom,
    scrollToMessage,
    scrollToPreviousUserMessage,
  };
};
