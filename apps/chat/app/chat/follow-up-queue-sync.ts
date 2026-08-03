import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
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

type QueueComparable = {
  id: string;
  text: string;
  files: readonly {
    url: string;
    mediaType: string;
    filename?: string;
  }[];
};

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

export const shouldApplyRemoteFollowUpQueue = ({
  payload,
  sessionId,
  tabId,
  revision,
}: {
  payload: QueueSyncPayload;
  sessionId: string | undefined;
  tabId: string;
  revision: number;
}): boolean => {
  if (sessionId === undefined) return false;
  if (payload.sessionId !== sessionId) return false;
  if (payload.tabId === tabId) return false;
  return payload.revision >= revision;
};

export const shouldHandleRemoteForceSend = ({
  payload,
  sessionId,
  tabId,
  isStreaming,
}: {
  payload: QueueForceSendPayload;
  sessionId: string | undefined;
  tabId: string;
  isStreaming: boolean;
}): boolean => {
  if (!isStreaming) return false;
  if (sessionId === undefined) return false;
  if (payload.sessionId !== sessionId) return false;
  return payload.tabId !== tabId;
};

export const queuesEqual = ({
  left,
  right,
}: {
  left: readonly QueueComparable[];
  right: readonly QueueComparable[];
}): boolean => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    if (other === undefined) return false;
    if (item.id !== other.id || item.text !== other.text) return false;
    if (item.files.length !== other.files.length) return false;
    return item.files.every((file, fileIndex) => {
      const otherFile = other.files[fileIndex];
      return (
        otherFile !== undefined &&
        file.url === otherFile.url &&
        file.mediaType === otherFile.mediaType &&
        file.filename === otherFile.filename
      );
    });
  });
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
