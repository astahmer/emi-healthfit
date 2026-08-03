import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type {
  ChatQueueSyncAdapter,
  ChatQueueSyncMessage,
  ChatQueueSyncPayload,
} from "@emi/core/runtime";
import type { QueuedFollowUp } from "./chat-runtime-context";

export const FOLLOW_UP_QUEUE_STORAGE_PREFIX = "emi-chat:follow-up-queue:";
export const FOLLOW_UP_QUEUE_CHANNEL = "emi-chat-follow-up-queue";
export const FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS = 1_500_000;

const FilePartSchema = Schema.Struct({
  type: Schema.Literal("file"),
  mediaType: Schema.String,
  filename: Schema.optional(Schema.String),
  url: Schema.String,
});

const QueuedFollowUpSchema = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  files: Schema.Array(FilePartSchema),
});

const QueueSyncPayloadSchema = Schema.Struct({
  type: Schema.Literal("queue.sync"),
  sessionId: Schema.String,
  tabId: Schema.String,
  revision: Schema.Number,
  items: Schema.Array(QueuedFollowUpSchema),
});
const QueueSyncJsonSchema = Schema.fromJsonString(QueueSyncPayloadSchema);

const QueueForceSendPayloadSchema = Schema.Struct({
  type: Schema.Literal("queue.force-send"),
  sessionId: Schema.String,
  tabId: Schema.String,
  itemId: Schema.String,
});

const QueueChannelMessageSchema = Schema.Union([
  QueueSyncPayloadSchema,
  QueueForceSendPayloadSchema,
]);

export type QueueSyncPayload = typeof QueueSyncPayloadSchema.Type;
export type QueueForceSendPayload = typeof QueueForceSendPayloadSchema.Type;
export type QueueChannelMessage = typeof QueueChannelMessageSchema.Type;

export const followUpQueueStorageKey = (sessionId: string): string =>
  `${FOLLOW_UP_QUEUE_STORAGE_PREFIX}${sessionId}`;

export const stripHeavyQueueFiles = (items: QueuedFollowUp[]): QueuedFollowUp[] =>
  items.map((item) => ({
    ...item,
    files: item.files.map((file) => ({
      ...file,
      url: file.url.length > 8_000 ? "" : file.url,
    })),
  }));

export const serializeFollowUpQueue = ({
  sessionId,
  tabId,
  revision,
  items,
}: {
  sessionId: string;
  tabId: string;
  revision: number;
  items: QueuedFollowUp[];
}): string => {
  const payload: QueueSyncPayload = {
    type: "queue.sync",
    sessionId,
    tabId,
    revision,
    items,
  };
  const full = JSON.stringify(payload);
  if (full.length <= FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS) return full;
  return JSON.stringify({
    ...payload,
    items: stripHeavyQueueFiles(items),
  });
};

export const parseFollowUpQueueSync = (raw: unknown): QueueSyncPayload | null => {
  const decoded = Schema.decodeUnknownOption(QueueSyncPayloadSchema)(raw);
  return Option.isSome(decoded) ? decoded.value : null;
};

export const parseFollowUpQueueChannelMessage = (raw: unknown): QueueChannelMessage | null => {
  const decoded = Schema.decodeUnknownOption(QueueChannelMessageSchema)(raw);
  return Option.isSome(decoded) ? decoded.value : null;
};

export const parseFollowUpQueueSyncJson = (raw: string): QueueSyncPayload | null => {
  const decoded = Schema.decodeUnknownOption(QueueSyncJsonSchema)(raw);
  return Option.isSome(decoded) ? decoded.value : null;
};

export const readStoredFollowUpQueue = ({
  sessionId,
  storage = globalThis.localStorage,
}: {
  sessionId: string;
  storage?: Pick<Storage, "getItem">;
}): QueueSyncPayload | null => {
  try {
    const raw = storage.getItem(followUpQueueStorageKey(sessionId));
    if (raw === null) return null;
    return parseFollowUpQueueSyncJson(raw);
  } catch {
    return null;
  }
};

export const writeStoredFollowUpQueue = ({
  sessionId,
  tabId,
  revision,
  items,
  storage = globalThis.localStorage,
}: {
  sessionId: string;
  tabId: string;
  revision: number;
  items: QueuedFollowUp[];
  storage?: Pick<Storage, "setItem" | "removeItem">;
}): void => {
  const key = followUpQueueStorageKey(sessionId);
  try {
    if (items.length === 0) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, serializeFollowUpQueue({ sessionId, tabId, revision, items }));
  } catch {
    try {
      storage.setItem(
        key,
        serializeFollowUpQueue({
          sessionId,
          tabId,
          revision,
          items: stripHeavyQueueFiles(items),
        }),
      );
    } catch {
      // ignore quota / private-mode failures
    }
  }
};

const toCoreQueuePayload = (payload: QueueSyncPayload): ChatQueueSyncPayload => ({
  type: "queue.sync",
  sessionId: payload.sessionId,
  tabId: payload.tabId,
  revision: payload.revision,
  items: payload.items.map((item) => ({
    id: item.id,
    text: item.text,
    attachments: item.files.map((file) => ({
      id: `attachment:${file.url}`,
      name: file.filename ?? "Attachment",
      mediaType: file.mediaType,
      url: file.url,
    })),
  })),
});

const toStoredQueuePayload = (payload: ChatQueueSyncPayload): QueueSyncPayload => ({
  type: "queue.sync",
  sessionId: payload.sessionId,
  tabId: payload.tabId,
  revision: payload.revision,
  items: payload.items.map((item) => ({
    id: item.id,
    text: item.text,
    files: item.attachments.map((attachment) => ({
      type: "file" as const,
      mediaType: attachment.mediaType,
      filename: attachment.name,
      url: attachment.url,
    })),
  })),
});

const toCoreQueueMessage = (message: QueueChannelMessage): ChatQueueSyncMessage => {
  if (message.type === "queue.sync") return toCoreQueuePayload(message);
  return message;
};

export const createFollowUpQueueSyncAdapter = (): ChatQueueSyncAdapter => {
  const tabId = crypto.randomUUID();
  return {
    tabId,
    read: (sessionId) => {
      const stored = readStoredFollowUpQueue({ sessionId });
      return stored === null ? null : toCoreQueuePayload(stored);
    },
    write: (payload) => {
      const stored = toStoredQueuePayload(payload);
      writeStoredFollowUpQueue({
        sessionId: stored.sessionId,
        tabId: stored.tabId,
        revision: stored.revision,
        items: stored.items.map((item) => ({
          id: item.id,
          text: item.text,
          files: [...item.files],
        })),
      });
    },
    subscribe: (sessionId, listener) => {
      const channel =
        typeof BroadcastChannel === "undefined"
          ? null
          : new BroadcastChannel(FOLLOW_UP_QUEUE_CHANNEL);
      const onChannelMessage = (event: MessageEvent<unknown>) => {
        const message = parseFollowUpQueueChannelMessage(event.data);
        if (message !== null) listener(toCoreQueueMessage(message));
      };
      channel?.addEventListener("message", onChannelMessage);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== followUpQueueStorageKey(sessionId)) return;
        if (event.newValue === null) {
          listener({
            type: "queue.sync",
            sessionId,
            tabId: "storage:cleared",
            revision: Number.MAX_SAFE_INTEGER,
            items: [],
          });
          return;
        }
        const payload = parseFollowUpQueueSyncJson(event.newValue);
        if (payload !== null) listener(toCoreQueuePayload(payload));
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
        channel?.removeEventListener("message", onChannelMessage);
        channel?.close();
      };
    },
    broadcast: (message) => {
      if (typeof BroadcastChannel === "undefined") return;
      const channel = new BroadcastChannel(FOLLOW_UP_QUEUE_CHANNEL);
      try {
        channel.postMessage(
          message.type === "queue.sync" ? toStoredQueuePayload(message) : message,
        );
      } catch {
        return;
      } finally {
        channel.close();
      }
    },
  };
};
