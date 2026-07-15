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
    assert.equal(isProtectedPath("/api/chat"), true);
    assert.equal(isProtectedPath("/api/chat/id/stream"), true);
    assert.equal(isProtectedPath("/ingest"), true);
    assert.equal(isProtectedPath("/chat"), true);
    assert.equal(isProtectedPath("/chat/session-id"), false);
    assert.equal(isProtectedPath("/icon.svg"), false);
  });
});
