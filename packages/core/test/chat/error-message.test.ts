import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readableErrorMessage } from "../../src/chat/error-message.ts";

describe("readableErrorMessage", () => {
  it("keeps Error messages", () => {
    assert.equal(
      readableErrorMessage(new Error("Model overloaded"), "fallback"),
      "Model overloaded",
    );
  });

  it("keeps plain strings", () => {
    assert.equal(readableErrorMessage("Rate limited", "fallback"), "Rate limited");
  });

  it("extracts a message from a plain provider error object", () => {
    assert.equal(
      readableErrorMessage(
        { error: { message: "Model overloaded", type: "server_error" } },
        "fallback",
      ),
      "Model overloaded",
    );
  });

  it("extracts a direct error string from an object", () => {
    assert.equal(readableErrorMessage({ error: "Bad request" }, "fallback"), "Bad request");
  });

  it("extracts a direct message string from an object", () => {
    assert.equal(
      readableErrorMessage({ message: "Context too long" }, "fallback"),
      "Context too long",
    );
  });

  it("serializes a nested plain object instead of emitting [object Object]", () => {
    assert.equal(
      readableErrorMessage({ nested: { value: 1 } }, "fallback"),
      '{"nested":{"value":1}}',
    );
    assert.equal(readableErrorMessage({}, "fallback"), "fallback");
  });

  it("serializes a useful plain object instead of falling back", () => {
    assert.equal(
      readableErrorMessage({ code: "rate_limit", retryAfter: 42 }, "fallback"),
      '{"code":"rate_limit","retryAfter":42}',
    );
  });

  it("falls back on circular objects instead of throwing", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.equal(readableErrorMessage(circular, "fallback"), "fallback");
  });

  it("uses status text for Response-like objects", () => {
    assert.equal(
      readableErrorMessage({ status: 502, statusText: "Bad Gateway" }, "fallback"),
      "502 Bad Gateway",
    );
  });

  it("falls back for null, undefined, and primitives", () => {
    assert.equal(readableErrorMessage(null, "fallback"), "fallback");
    assert.equal(readableErrorMessage(undefined, "fallback"), "fallback");
    assert.equal(readableErrorMessage(42, "fallback"), "fallback");
  });

  it("caps very long messages", () => {
    const long = "x".repeat(500);
    assert.equal(readableErrorMessage(long, "fallback").length, 301);
  });
});
