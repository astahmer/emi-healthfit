import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("chat stream persistence boundary", () => {
  it("maps readable-stream failures into the typed Effect error channel", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/core/routes/chat-stream-persistence.ts", import.meta.url)),
      "utf8",
    );

    assert.match(source, /class ChatStreamPersistenceError/);
    assert.match(source, /onError:\s*\(cause\)\s*=>\s*new ChatStreamPersistenceError/);
    assert.doesNotMatch(source, /onError: \(error\) => error/);
  });
});
