import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";
import { Conversation, CoreApi, EmiApi, Memory, Note } from "../../src/contract/index.ts";

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
  });

  it("exposes generic and HealthFit API compositions explicitly", () => {
    assert.deepEqual(Object.keys(CoreApi.groups).sort(), [
      "conversations",
      "discord",
      "memories",
      "memoryExtraction",
      "messages",
      "notes",
      "suggestions",
      "threads",
    ]);
    assert.deepEqual(Object.keys(EmiApi.groups).sort(), [
      "analytics",
      "conversations",
      "data",
      "discord",
      "hevy",
      "memories",
      "memoryExtraction",
      "messages",
      "notes",
      "privacy",
      "suggestions",
      "threads",
      "workouts",
    ]);
  });

  it("does not import Cloudflare or Worker platform packages", async () => {
    const srcRoot = join(fileURLToPath(new URL("../../src/contract", import.meta.url)));
    const walk = async (directory: string): Promise<string[]> => {
      const entries = await readdir(directory, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await walk(path)));
        else if (entry.name.endsWith(".ts")) files.push(path);
      }
      return files;
    };
    const banned = ["alchemy/", "cloudflare:", "kysely-d1", "drizzle-orm", "wrangler"];
    const violations: string[] = [];
    for (const file of await walk(srcRoot)) {
      const source = await readFile(file, "utf8");
      for (const token of banned) {
        if (source.includes(token)) violations.push(`${file}:${token}`);
      }
    }
    assert.deepEqual(violations, []);
  });
});
