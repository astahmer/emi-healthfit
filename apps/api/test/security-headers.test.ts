import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSecurityHeaders, securityHeaders } from "../src/platform/http/security-headers.ts";

describe("security headers", () => {
  it("includes referrer, framing, and CSP defaults", () => {
    assert.equal(securityHeaders["referrer-policy"], "no-referrer");
    assert.equal(securityHeaders["x-frame-options"], "DENY");
    assert.match(securityHeaders["content-security-policy"], /default-src 'self'/);
    assert.match(securityHeaders["content-security-policy"], /frame-ancestors 'none'/);
  });

  it("lets response-specific headers override defaults", () => {
    const merged = mergeSecurityHeaders({
      "content-type": "application/json",
      "x-frame-options": "SAMEORIGIN",
    });
    assert.equal(merged["content-type"], "application/json");
    assert.equal(merged["x-frame-options"], "SAMEORIGIN");
    assert.equal(merged["referrer-policy"], "no-referrer");
  });
});
