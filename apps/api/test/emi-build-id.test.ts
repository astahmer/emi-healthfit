import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEmiBuildId } from "../src/platform/emi-build-id.ts";

describe("resolveEmiBuildId", () => {
  it("prefers EMI_BUILD_ID", () => {
    assert.equal(
      resolveEmiBuildId({
        stage: "prod",
        env: {
          EMI_BUILD_ID: "manual",
          GITHUB_SHA: "abcdef0123456789",
          CF_PAGES_COMMIT_SHA: "cfpages1",
        },
      }),
      "manual",
    );
  });

  it("uses Cloudflare Pages sha before GitHub sha", () => {
    assert.equal(
      resolveEmiBuildId({
        stage: "prod",
        env: {
          CF_PAGES_COMMIT_SHA: "cfpagesabcdef",
          GITHUB_SHA: "githubabcdef",
        },
      }),
      "cfpages",
    );
  });

  it("falls back to a short GitHub sha", () => {
    assert.equal(
      resolveEmiBuildId({
        stage: "prod",
        env: { GITHUB_SHA: "abcdef0123456789" },
      }),
      "abcdef0",
    );
  });

  it("falls back to the alchemy stage when no commit env is set", () => {
    assert.equal(resolveEmiBuildId({ stage: "prod", env: {} }), "prod");
    assert.equal(resolveEmiBuildId({ stage: "dev", env: {} }), "dev");
  });
});
