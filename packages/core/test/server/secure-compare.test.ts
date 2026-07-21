import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { secureStringEqual } from "../../src/server/secure-compare.ts";

describe("secureStringEqual", () => {
  it("returns true for identical secrets", () => {
    assert.equal(secureStringEqual("same-secret-value", "same-secret-value"), true);
  });

  it("returns false for different secrets of equal length", () => {
    assert.equal(secureStringEqual("aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaab"), false);
  });

  it("returns false for different lengths without treating either as equal", () => {
    assert.equal(secureStringEqual("short", "longer-secret"), false);
    assert.equal(secureStringEqual("longer-secret", "short"), false);
  });

  it("returns false when either side is empty unless both empty", () => {
    assert.equal(secureStringEqual("", ""), true);
    assert.equal(secureStringEqual("", "x"), false);
    assert.equal(secureStringEqual("x", ""), false);
  });
});
