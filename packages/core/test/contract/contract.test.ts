import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";
import { Conversation, CoreApi, Memory, Note } from "../../src/contract.export.ts";

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
});
