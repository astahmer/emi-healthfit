import * as Schema from "effect/Schema";

export class ChatThreadScroll {
  private static readonly cacheStorageKey = "tsr-scroll-restoration-v1_3";
  static readonly elementId = "chat-thread";
  static readonly restorationStorageKey = ChatThreadScroll.cacheStorageKey;
  static readonly selector = `[data-scroll-restoration-id="${ChatThreadScroll.elementId}"]`;

  private static readonly ScrollEntry = Schema.Struct({
    scrollX: Schema.optional(Schema.Number),
    scrollY: Schema.optional(Schema.Number),
  });

  private static readonly ScrollRestorationCache = Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, ChatThreadScroll.ScrollEntry),
  );

  private static readonly decodeScrollRestorationCache = Schema.decodeUnknownSync(
    Schema.fromJsonString(ChatThreadScroll.ScrollRestorationCache),
  );

  static key({ sessionId }: { sessionId: string | undefined }): string {
    return sessionId === undefined ? "/chat" : `/chat/${sessionId}`;
  }

  static readScrollY({ sessionId }: { sessionId: string | undefined }): number | undefined {
    try {
      const cache = ChatThreadScroll.decodeScrollRestorationCache(
        sessionStorage.getItem(ChatThreadScroll.cacheStorageKey) ?? "{}",
      );
      const entry = cache[ChatThreadScroll.key({ sessionId })]?.[ChatThreadScroll.selector];
      return typeof entry?.scrollY === "number" ? entry.scrollY : undefined;
    } catch {
      return undefined;
    }
  }

  static writeScrollY({
    sessionId,
    scrollY,
  }: {
    sessionId: string | undefined;
    scrollY: number;
  }): void {
    try {
      const cache = ChatThreadScroll.readCache();
      const key = ChatThreadScroll.key({ sessionId });
      cache[key] = {
        ...cache[key],
        [ChatThreadScroll.selector]: { scrollX: 0, scrollY },
      };
      sessionStorage.setItem(ChatThreadScroll.cacheStorageKey, JSON.stringify(cache));
    } catch {
      return;
    }
  }

  static preview({ text, maxLength = 120 }: { text: string; maxLength?: number }): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1)}…`;
  }

  private static readCache(): Record<
    string,
    Record<string, { scrollX?: number; scrollY?: number }>
  > {
    try {
      return ChatThreadScroll.decodeScrollRestorationCache(
        sessionStorage.getItem(ChatThreadScroll.cacheStorageKey) ?? "{}",
      );
    } catch {
      return {};
    }
  }
}
