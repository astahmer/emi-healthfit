import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  isSafeMarkdownHref,
  shouldRenderMarkdownImage,
} from "../../src/web/thread/markdown-url-policy.ts";

describe("markdown URL policy", () => {
  it("allows http(s), mailto, message refs, anchors, and relative paths", () => {
    assert.equal(isSafeMarkdownHref("https://example.com/a"), true);
    assert.equal(isSafeMarkdownHref("http://example.com/a"), true);
    assert.equal(isSafeMarkdownHref("mailto:coach@example.com"), true);
    assert.equal(isSafeMarkdownHref("message:abc"), true);
    assert.equal(isSafeMarkdownHref("#section"), true);
    assert.equal(isSafeMarkdownHref("/chat/one"), true);
  });

  it("rejects executable and unknown schemes", () => {
    assert.equal(isSafeMarkdownHref("javascript:alert(1)"), false);
    assert.equal(isSafeMarkdownHref("data:text/html;base64,aaaa"), false);
    assert.equal(isSafeMarkdownHref("vbscript:msg"), false);
    assert.equal(isSafeMarkdownHref("//evil.example"), false);
    assert.equal(isSafeMarkdownHref(""), false);
    assert.equal(isSafeMarkdownHref(undefined), false);
  });

  it("only renders safe images", () => {
    assert.equal(shouldRenderMarkdownImage("https://cdn.example/a.png"), true);
    assert.equal(shouldRenderMarkdownImage("/assets/logo.png"), true);
    assert.equal(shouldRenderMarkdownImage("data:image/png;base64,abc"), true);
    assert.equal(shouldRenderMarkdownImage("http://insecure.example/a.png"), false);
    assert.equal(shouldRenderMarkdownImage("javascript:alert(1)"), false);
    assert.equal(shouldRenderMarkdownImage(undefined), false);
  });
});
