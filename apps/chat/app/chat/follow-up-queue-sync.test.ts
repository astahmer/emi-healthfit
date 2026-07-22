import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS,
  parseFollowUpQueueSyncJson,
  serializeFollowUpQueue,
  shouldApplyRemoteFollowUpQueue,
  shouldHandleRemoteForceSend,
  stripHeavyQueueFiles,
  writeStoredFollowUpQueue,
  readStoredFollowUpQueue,
  followUpQueueStorageKey,
} from "./follow-up-queue-sync";

const item = (id: string, text: string, url = "data:text/plain;base64,YQ==") => ({
  id,
  text,
  files:
    url === "" ? [] : [{ type: "file" as const, mediaType: "text/plain", filename: "a.txt", url }],
});

describe("follow-up queue sync", () => {
  it("round-trips a queue payload through JSON", () => {
    const raw = serializeFollowUpQueue({
      sessionId: "one",
      tabId: "tab-a",
      revision: 3,
      items: [item("q1", "Hello")],
    });
    expect(parseFollowUpQueueSyncJson(raw)).toEqual({
      type: "queue.sync",
      sessionId: "one",
      tabId: "tab-a",
      revision: 3,
      items: [item("q1", "Hello")],
    });
  });

  it("ignores own-tab and stale remote payloads", () => {
    const payload = {
      type: "queue.sync" as const,
      sessionId: "one",
      tabId: "tab-a",
      revision: 2,
      items: [item("q1", "Hello")],
    };
    expect(
      shouldApplyRemoteFollowUpQueue({
        payload,
        sessionId: "one",
        tabId: "tab-a",
        revision: 1,
      }),
    ).toBe(false);
    expect(
      shouldApplyRemoteFollowUpQueue({
        payload: { ...payload, tabId: "tab-b", revision: 1 },
        sessionId: "one",
        tabId: "tab-a",
        revision: 2,
      }),
    ).toBe(false);
    expect(
      shouldApplyRemoteFollowUpQueue({
        payload: { ...payload, tabId: "tab-b", revision: 2 },
        sessionId: "one",
        tabId: "tab-a",
        revision: 2,
      }),
    ).toBe(true);
  });

  it("strips oversized file urls before persistence overflow", () => {
    const huge = item("q1", "with file", `data:text/plain;base64,${"A".repeat(10_000)}`);
    expect(stripHeavyQueueFiles([huge])[0]?.files[0]?.url).toBe("");
    const raw = serializeFollowUpQueue({
      sessionId: "one",
      tabId: "tab-a",
      revision: 1,
      items: [
        item("q1", "x", `data:text/plain;base64,${"B".repeat(FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS)}`),
      ],
    });
    expect(raw.length).toBeLessThan(FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS);
  });

  it("reads and writes through a storage stub", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    writeStoredFollowUpQueue({
      sessionId: "one",
      tabId: "tab-a",
      revision: 4,
      items: [item("q1", "Hi")],
      storage,
    });
    expect(store.has(followUpQueueStorageKey("one"))).toBe(true);
    expect(readStoredFollowUpQueue({ sessionId: "one", storage })).toEqual({
      type: "queue.sync",
      sessionId: "one",
      tabId: "tab-a",
      revision: 4,
      items: [item("q1", "Hi")],
    });
    writeStoredFollowUpQueue({
      sessionId: "one",
      tabId: "tab-a",
      revision: 5,
      items: [],
      storage,
    });
    expect(store.has(followUpQueueStorageKey("one"))).toBe(false);
  });

  it("only lets the streaming tab handle remote force-send", () => {
    const payload = {
      type: "queue.force-send" as const,
      sessionId: "one",
      tabId: "tab-b",
      itemId: "q1",
    };
    expect(
      shouldHandleRemoteForceSend({
        payload,
        sessionId: "one",
        tabId: "tab-a",
        isStreaming: true,
      }),
    ).toBe(true);
    expect(
      shouldHandleRemoteForceSend({
        payload,
        sessionId: "one",
        tabId: "tab-a",
        isStreaming: false,
      }),
    ).toBe(false);
  });
});
