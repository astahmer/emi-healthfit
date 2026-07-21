import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  checkDiscordRateLimit,
  DISCORD_RATE_LIMIT_MAX,
  resetDiscordRateLimitsForTests,
} from "../src/commands/limits.ts";

describe("checkDiscordRateLimit", () => {
  beforeEach(() => {
    resetDiscordRateLimitsForTests();
  });

  it("allows up to the configured burst then rejects", () => {
    for (let index = 0; index < DISCORD_RATE_LIMIT_MAX; index += 1) {
      assert.equal(checkDiscordRateLimit("user-a", 1_000), true);
    }
    assert.equal(checkDiscordRateLimit("user-a", 1_000), false);
  });

  it("isolates buckets per Discord user id", () => {
    for (let index = 0; index < DISCORD_RATE_LIMIT_MAX; index += 1) {
      assert.equal(checkDiscordRateLimit("user-a", 1_000), true);
    }
    assert.equal(checkDiscordRateLimit("user-b", 1_000), true);
  });

  it("resets after the window elapses", () => {
    for (let index = 0; index < DISCORD_RATE_LIMIT_MAX; index += 1) {
      assert.equal(checkDiscordRateLimit("user-a", 1_000), true);
    }
    assert.equal(checkDiscordRateLimit("user-a", 1_000), false);
    assert.equal(checkDiscordRateLimit("user-a", 1_000 + 60_000), true);
  });
});
