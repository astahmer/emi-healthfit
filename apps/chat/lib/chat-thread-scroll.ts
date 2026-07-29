import * as Schema from "effect/Schema";

export const CHAT_THREAD_SCROLL_ID = "chat-thread";

export const SCROLL_RESTORATION_STORAGE_KEY = "tsr-scroll-restoration-v1_3";

const ScrollEntry = Schema.Struct({
  scrollX: Schema.optional(Schema.Number),
  scrollY: Schema.optional(Schema.Number),
});

const ScrollRestorationCache = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, ScrollEntry),
);

const decodeScrollRestorationCache = Schema.decodeUnknownSync(
  Schema.fromJsonString(ScrollRestorationCache),
);

export const chatThreadScrollKey = ({ sessionId }: { sessionId: string | undefined }) =>
  sessionId === undefined ? "/chat" : `/chat/${sessionId}`;

export const chatThreadScrollSelector = `[data-scroll-restoration-id="${CHAT_THREAD_SCROLL_ID}"]`;

const readScrollRestorationCache = () => {
  try {
    return decodeScrollRestorationCache(
      sessionStorage.getItem(SCROLL_RESTORATION_STORAGE_KEY) ?? "{}",
    );
  } catch {
    return {};
  }
};

export const readChatThreadScrollY = ({
  sessionId,
}: {
  sessionId: string | undefined;
}): number | undefined => {
  const entry =
    readScrollRestorationCache()[chatThreadScrollKey({ sessionId })]?.[chatThreadScrollSelector];
  return typeof entry?.scrollY === "number" ? entry.scrollY : undefined;
};

export const writeChatThreadScrollY = ({
  sessionId,
  scrollY,
}: {
  sessionId: string | undefined;
  scrollY: number;
}) => {
  try {
    const cache = { ...readScrollRestorationCache() };
    const key = chatThreadScrollKey({ sessionId });
    cache[key] = {
      ...cache[key],
      [chatThreadScrollSelector]: { scrollX: 0, scrollY },
    };
    sessionStorage.setItem(SCROLL_RESTORATION_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // sessionStorage may be unavailable
  }
};

export const previewMessageText = ({
  text,
  maxLength = 120,
}: {
  text: string;
  maxLength?: number;
}) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
};
