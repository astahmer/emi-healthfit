import { useCallback, useEffect, useRef } from "react";
import type { ChatRuntime } from "@emi/core/runtime";
import type { Attachment } from "@emi/core/protocol";
import type { QueuedFollowUp } from "./chat-runtime-context";
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

const toCoreFollowUps = (items: QueuedFollowUp[]) =>
  items.map((item) => ({
    id: item.id,
    text: item.text,
    attachments: item.files.map(
      (file): Attachment => ({
        id: `attachment:${file.url}`,
        name: file.filename ?? "Attachment",
        mediaType: file.mediaType,
        url: file.url,
      }),
    ),
  }));

const toUiFollowUps = (items: QueueSyncPayload["items"]): QueuedFollowUp[] =>
  items.map((item) => ({
    id: item.id,
    text: item.text,
    files: [...item.files],
  }));

const comparableItems = (items: QueuedFollowUp[]) =>
  items.map((item) => ({
    id: item.id,
    text: item.text,
    files: item.files,
  }));

export const useFollowUpQueueSync = ({
  runtime,
  sessionId,
  temporary,
  active,
  queuedFollowUps,
  isStreaming,
}: {
  runtime: ChatRuntime;
  sessionId: string | undefined;
  temporary: boolean;
  active: boolean;
  queuedFollowUps: QueuedFollowUp[];
  isStreaming: boolean;
}) => {
  const tabIdRef = useRef(crypto.randomUUID());
  const revisionRef = useRef(0);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const isStreamingRef = useRef(isStreaming);
  const queuedFollowUpsRef = useRef(queuedFollowUps);

  queuedFollowUpsRef.current = queuedFollowUps;

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    hydratedRef.current = false;
    skipNextPersistRef.current = false;
    if (!active || temporary || sessionId === undefined) {
      hydratedRef.current = true;
      return;
    }
    const stored = readStoredFollowUpQueue({ sessionId });
    if (stored !== null) {
      applyingRemoteRef.current = true;
      revisionRef.current = stored.revision;
      skipNextPersistRef.current = true;
      runtime.actions.replaceQueuedFollowUps({
        items: toCoreFollowUps(toUiFollowUps(stored.items)),
      });
    }
    hydratedRef.current = true;
  }, [active, runtime, sessionId, temporary]);

  useEffect(() => {
    if (
      !active ||
      temporary ||
      sessionId === undefined ||
      typeof BroadcastChannel === "undefined"
    ) {
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
      )
        return;
      if (
        queuesEqual({
          left: comparableItems(queuedFollowUpsRef.current),
          right: payload.items,
        })
      ) {
        revisionRef.current = Math.max(revisionRef.current, payload.revision);
        return;
      }
      applyingRemoteRef.current = true;
      skipNextPersistRef.current = true;
      revisionRef.current = payload.revision;
      runtime.actions.replaceQueuedFollowUps({
        items: toCoreFollowUps(toUiFollowUps(payload.items)),
      });
    };

    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = parseFollowUpQueueChannelMessage(event.data);
      if (message?.type === "queue.sync") {
        applyPayload(message);
        return;
      }
      if (
        message?.type === "queue.force-send" &&
        shouldHandleRemoteForceSend({
          payload: message,
          sessionId,
          tabId: tabIdRef.current,
          isStreaming: isStreamingRef.current,
        })
      )
        runtime.actions.forceSendQueuedFollowUp({ id: message.itemId });
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
  }, [active, runtime, sessionId, temporary]);

  useEffect(() => {
    if (!active || !hydratedRef.current || temporary || sessionId === undefined) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      applyingRemoteRef.current = false;
      return;
    }
    if (applyingRemoteRef.current) return;
    revisionRef.current += 1;
    const payload: QueueSyncPayload = {
      type: "queue.sync",
      sessionId,
      tabId: tabIdRef.current,
      revision: revisionRef.current,
      items: queuedFollowUps,
    };
    writeStoredFollowUpQueue({
      sessionId,
      tabId: tabIdRef.current,
      revision: revisionRef.current,
      items: queuedFollowUps,
    });
    try {
      channelRef.current?.postMessage(payload);
    } catch {
      return;
    }
  }, [active, queuedFollowUps, sessionId, temporary]);

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
        return;
      }
    },
    [sessionId, temporary],
  );

  return { requestForceSendAcrossTabs };
};
