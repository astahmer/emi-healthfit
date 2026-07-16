import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAllowedEmails } from "../src/auth/auth.ts";
import { isProtectedPath } from "../src/auth/request-auth.ts";

describe("authentication boundaries", () => {
  it("normalizes and deduplicates configured emails", () => {
    assert.deepEqual(
      [...parseAllowedEmails(" Coach@Example.com,coach@example.com , second@example.com")],
      ["coach@example.com", "second@example.com"],
    );
  });

  it("protects personal endpoints while leaving assets public", () => {
    for (const path of [
      "/api/chat",
      "/api/chat/id/stream",
      "/api/analytics/overview",
      "/api/export/ingested-data",
      "/api/import/ingested-data",
      "/api/privacy",
      "/api/workouts",
      "/api/conversations",
      "/api/notes",
      "/api/memories",
      "/ingest",
      "/chat",
    ]) {
      assert.equal(isProtectedPath(path), true, path);
    }
    assert.equal(isProtectedPath("/chat/session-id"), false);
    assert.equal(isProtectedPath("/icon.svg"), false);
  });
});
