import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { type EventFrom, type SnapshotFrom } from "xstate";
import { chatRuntimeMachine, type QueuedFollowUp } from "./chat-runtime-machine";
import {
  FOLLOW_UP_QUEUE_CHANNEL,
  followUpQueueStorageKey,
  parseFollowUpQueueChannelMessage,
  parseFollowUpQueueSyncJson,
  queuesEqual,
  readStoredFollowUpQueue,
  shouldApplyRemoteFollowUpQueue,
  shouldHandleRemoteForceSend,
  writeStoredFollowUpQueue,
  type QueueSyncPayload,
} from "./follow-up-queue-sync";

type ChatRuntimeSnapshot = SnapshotFrom<typeof chatRuntimeMachine>;
type ChatRuntimeEvent = EventFrom<typeof chatRuntimeMachine>;

const toQueuedFollowUps = (items: QueueSyncPayload["items"]): QueuedFollowUp[] =>
  items.map((item) => ({
    id: item.id,
    text: item.text,
    files: item.files.map((file) => ({
      type: "file" as const,
      mediaType: file.mediaType,
      filename: file.filename,
      url: file.url,
    })),
  }));

export const useFollowUpQueueSync = ({
  sessionId,
  temporary,
  queuedFollowUps,
  isStreaming,
  stateRef,
  send,
  onRemoteQueueApplied,
  onRemoteForceSend,
}: {
  sessionId: string | undefined;
  temporary: boolean;
  queuedFollowUps: QueuedFollowUp[];
  isStreaming: boolean;
  stateRef: MutableRefObject<ChatRuntimeSnapshot>;
  send: (event: ChatRuntimeEvent) => void;
  onRemoteQueueApplied?: (items: QueuedFollowUp[]) => void;
  onRemoteForceSend?: (itemId: string) => void;
}) => {
  const tabIdRef = useRef(crypto.randomUUID());
  const revisionRef = useRef(0);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const isStreamingRef = useRef(isStreaming);
  const onRemoteForceSendRef = useRef(onRemoteForceSend);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    onRemoteForceSendRef.current = onRemoteForceSend;
  }, [onRemoteForceSend]);

  useLayoutEffect(() => {
    hydratedRef.current = false;
    if (temporary || sessionId === undefined) {
      hydratedRef.current = true;
      return;
    }
    const stored = readStoredFollowUpQueue({ sessionId });
    if (stored !== null) {
      applyingRemoteRef.current = true;
      revisionRef.current = stored.revision;
      const items = toQueuedFollowUps(stored.items);
      send({ type: "followUp.replaced", items });
      onRemoteQueueApplied?.(items);
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
      });
    }
    hydratedRef.current = true;
  }, [onRemoteQueueApplied, send, sessionId, temporary]);

  useEffect(() => {
    if (temporary || sessionId === undefined || typeof BroadcastChannel === "undefined") {
      channelRef.current?.close();
      channelRef.current = null;
      return;
    }

    const channel = new BroadcastChannel(FOLLOW_UP_QUEUE_CHANNEL);
    channelRef.current = channel;

    const applyPayload = (payload: QueueSyncPayload) => {
      if (
        !shouldApplyRemoteFollowUpQueue({
          payload,
          sessionId,
          tabId: tabIdRef.current,
          revision: revisionRef.current,
        })
      ) {
        return;
      }
      if (
        queuesEqual({
          left: stateRef.current.context.queuedFollowUps,
          right: payload.items,
        })
      ) {
        revisionRef.current = Math.max(revisionRef.current, payload.revision);
        return;
      }
      applyingRemoteRef.current = true;
      revisionRef.current = payload.revision;
      const items = toQueuedFollowUps(payload.items);
      send({ type: "followUp.replaced", items });
      onRemoteQueueApplied?.(items);
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
      });
    };

    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = parseFollowUpQueueChannelMessage(event.data);
      if (message === null) return;
      if (message.type === "queue.sync") {
        applyPayload(message);
        return;
      }
      if (
        shouldHandleRemoteForceSend({
          payload: message,
          sessionId,
          tabId: tabIdRef.current,
          isStreaming: isStreamingRef.current,
        })
      ) {
        onRemoteForceSendRef.current?.(message.itemId);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== followUpQueueStorageKey(sessionId)) return;
      if (event.newValue === null) {
        applyPayload({
          type: "queue.sync",
          sessionId,
          tabId: "storage:cleared",
          revision: revisionRef.current + 1,
          items: [],
        });
        return;
      }
      const payload = parseFollowUpQueueSyncJson(event.newValue);
      if (payload !== null) applyPayload(payload);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [onRemoteQueueApplied, send, sessionId, stateRef, temporary]);

  useEffect(() => {
    if (!hydratedRef.current || temporary || sessionId === undefined) return;
    if (applyingRemoteRef.current) return;
    revisionRef.current += 1;
    const revision = revisionRef.current;
    const payload: QueueSyncPayload = {
      type: "queue.sync",
      sessionId,
      tabId: tabIdRef.current,
      revision,
      items: queuedFollowUps,
    };
    writeStoredFollowUpQueue({
      sessionId,
      tabId: tabIdRef.current,
      revision,
      items: queuedFollowUps,
    });
    try {
      channelRef.current?.postMessage(payload);
    } catch {
      // ignore closed channel
    }
  }, [queuedFollowUps, sessionId, temporary]);

  const requestForceSendAcrossTabs = useCallback(
    (itemId: string) => {
      if (temporary || sessionId === undefined) return;
      try {
        channelRef.current?.postMessage({
          type: "queue.force-send",
          sessionId,
          tabId: tabIdRef.current,
          itemId,
        });
      } catch {
        // ignore closed channel
      }
    },
    [sessionId, temporary],
  );

  return { requestForceSendAcrossTabs };
};
