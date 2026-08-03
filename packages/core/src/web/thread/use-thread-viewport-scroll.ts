import { createActor } from "xstate";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { ChatThreadScroll } from "./chat-thread-scroll.ts";
import {
  threadViewportActor,
  threadViewportNeedsInitialPosition,
} from "./thread-viewport-actor.ts";

const NEAR_BOTTOM_PX = 160;
const PREV_USER_MARGIN_PX = 24;
const emptyUserMessageIds: readonly string[] = [];

export class ThreadViewportScroll {
  static scrollToMessage({ messageId }: { messageId: string }): void {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  static findPreviousUserMessageId({
    viewport,
    messageIds,
  }: {
    viewport: HTMLElement;
    messageIds: readonly string[];
  }): string | undefined {
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
  }
}

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
  const userMessageIdsKey = userMessageIds.join("\0");
  const sessionKey = sessionId ?? "new";
  const actor = useMemo(
    () => createActor(threadViewportActor, { input: { sessionKey, messageCount } }),
    [],
  );
  const subscribeToActor = useCallback(
    (listener: () => void) => {
      const subscription = actor.subscribe(listener);
      return () => subscription.unsubscribe();
    },
    [actor],
  );
  const snapshot = useSyncExternalStore(subscribeToActor, actor.getSnapshot, actor.getSnapshot);

  useEffect(() => {
    actor.start();
    return () => {
      actor.stop();
    };
  }, [actor]);

  useLayoutEffect(() => {
    actor.send({ type: "route-synced", sessionKey, messageCount });
  }, [actor, messageCount, sessionKey]);

  const measureViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    actor.send({
      type: "viewport-measured",
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      canScrollToPreviousUserMessage:
        ThreadViewportScroll.findPreviousUserMessageId({
          viewport,
          messageIds: userMessageIds,
        }) !== undefined,
    });
  }, [actor, userMessageIds]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    if (threadViewportNeedsInitialPosition(actor.getSnapshot().context)) {
      if (messageCount === 0) {
        viewport.scrollTop = 0;
        actor.send({ type: "empty-viewport-positioned" });
        return;
      }

      const restoredScrollY = ChatThreadScroll.readScrollY({ sessionId });
      viewport.scrollTop = restoredScrollY === undefined ? viewport.scrollHeight : restoredScrollY;
      actor.send({ type: "position-applied" });
    } else if (messageCount > 0) {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (distanceFromBottom < NEAR_BOTTOM_PX) viewport.scrollTop = viewport.scrollHeight;
    }

    measureViewport();
  }, [actor, measureViewport, messageCount, sessionId]);

  useLayoutEffect(() => {
    measureViewport();
  }, [measureViewport, userMessageIdsKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const onScroll = () => measureViewport();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [measureViewport, sessionKey]);

  const scrollToTop = () => viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  const scrollToBottom = () => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  };

  const scrollToPreviousUserMessage = () => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const messageId = ThreadViewportScroll.findPreviousUserMessageId({
      viewport,
      messageIds: userMessageIds,
    });
    if (messageId === undefined) return;
    ThreadViewportScroll.scrollToMessage({ messageId });
  };

  return {
    viewportRef,
    isAwayFromTop: snapshot.context.isAwayFromTop,
    isAwayFromBottom: snapshot.context.isAwayFromBottom,
    canScrollToPreviousUserMessage: snapshot.context.canScrollToPreviousUserMessage,
    scrollToTop,
    scrollToBottom,
    scrollToMessage: ThreadViewportScroll.scrollToMessage,
    scrollToPreviousUserMessage,
  };
};
