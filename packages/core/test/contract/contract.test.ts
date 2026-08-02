import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";
import { Conversation, CoreApi, Memory, Message, Note } from "../../src/contract.export.ts";

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walk(path);
        return entry.name.endsWith(".ts") ? [path] : [];
      }),
    )
  ).flat();
};

describe("@emi/core/contract", () => {
  it("encodes and decodes core wire DTOs", () => {
    const conversation = Schema.decodeUnknownSync(Conversation)({
      id: "c1",
      title: "Plan",
      status: "regular",
      pinned: false,
      created_at: "2026-07-21T00:00:00.000Z",
      updated_at: "2026-07-21T00:00:00.000Z",
    });
    assert.equal(conversation.id, "c1");

    const note = Schema.decodeUnknownSync(Note)({
      id: "n1",
      content: "note",
      created_at: "2026-07-21T00:00:00.000Z",
      updated_at: "2026-07-21T00:00:00.000Z",
    });
    assert.equal(note.content, "note");

    const memory = Schema.decodeUnknownSync(Memory)({
      id: "m1",
      content: "memory",
      source: "manual",
      thread_id: null,
      created_at: "2026-07-21T00:00:00.000Z",
    });
    assert.equal(memory.content, "memory");

    const message = Schema.decodeUnknownSync(Message)({
      id: "m1",
      conversationId: "c1",
      parentId: null,
      role: "assistant",
      parts: [{ type: "text", text: "reply" }],
      createdAt: "2026-07-21T00:00:00.000Z",
    });
    assert.equal(message.parts[0]?.type, "text");
    assert.throws(() =>
      Schema.decodeUnknownSync(Message)({
        ...message,
        parts: [{ type: "provider-private", payload: { value: true } }],
      }),
    );
  });

  it("rejects invalid token counts at the HTTP contract boundary", () => {
    const message = {
      id: "m1",
      conversationId: "c1",
      parentId: null,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "reply" }],
      createdAt: "2026-07-21T00:00:00.000Z",
    };

    assert.throws(() =>
      Schema.decodeUnknownSync(Message)({
        ...message,
        usage: { promptTokens: -1, completionTokens: 1, totalTokens: 0 },
      }),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(Message)({
        ...message,
        usage: { promptTokens: 1.5, completionTokens: 1, totalTokens: 0 },
      }),
    );
  });

  it("uses provider-neutral model configuration names at the contract boundary", async () => {
    const contract = await import("../../src/contract.export.ts");
    assert.equal("ModelClientConfiguration" in contract, true);
    assert.equal("OpenAiClientConfig" in contract, false);
    assert.deepEqual(
      Schema.decodeUnknownSync(contract.ModelClientConfiguration)({
        apiKey: "key",
        model: "generic-model",
      }),
      { apiKey: "key", model: "generic-model" },
    );
  });

  it("exposes only generic API groups", () => {
    assert.deepEqual(Object.keys(CoreApi.groups).toSorted(), [
      "conversations",
      "discord",
      "memories",
      "memoryExtraction",
      "messages",
      "notes",
      "suggestions",
      "threads",
    ]);
  });

  it("does not expose HealthFit product contract APIs", async () => {
    const contract = await import("../../src/contract.export.ts");
    const healthFitExports = [
      "AnalyticsApi",
      "DataApi",
      "HevyIntegrationApi",
      "PrivacyApi",
      "WorkoutsApi",
    ];
    assert.deepEqual(
      healthFitExports.filter((exportName) => exportName in contract),
      [],
    );
  });

  it("does not import Cloudflare or Worker platform packages", async () => {
    const srcRoot = join(fileURLToPath(new URL("../../src/contract", import.meta.url)));
    const banned = ["alchemy/", "cloudflare:", "kysely-d1", "drizzle-orm", "wrangler"];
    const violations = (
      await Promise.all(
        (
          await walk(srcRoot)
        ).map(async (file) => {
          const source = await readFile(file, "utf8");
          return banned.flatMap((token) => (source.includes(token) ? [`${file}:${token}`] : []));
        }),
      )
    ).flat();
    assert.deepEqual(violations, []);
  });

  it("does not use unknown as a normal contract or assistant-part boundary", async () => {
    const contractRoot = join(fileURLToPath(new URL("../../src/contract", import.meta.url)));
    const messagePartsPath = join(
      fileURLToPath(new URL("../../src/chat/message-parts.ts", import.meta.url)),
    );
    const contractFiles = await walk(contractRoot);
    const sources = await Promise.all([
      ...contractFiles.map((file) => readFile(file, "utf8")),
      readFile(messagePartsPath, "utf8"),
    ]);
    assert.equal(
      sources.some((source) => source.includes("Schema.Unknown")),
      false,
    );
  });
});
