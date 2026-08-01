import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  isSafeAttachmentUrl,
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

  it("allows declared attachment data and rejects executable or mismatched data", () => {
    assert.equal(
      isSafeAttachmentUrl({ href: "/attachments/report.txt", mediaType: "text/plain" }),
      true,
    );
    assert.equal(
      isSafeAttachmentUrl({ href: "https://cdn.example/report.txt", mediaType: "text/plain" }),
      true,
    );
    assert.equal(
      isSafeAttachmentUrl({ href: "data:text/plain;base64,abc", mediaType: "text/plain" }),
      true,
    );
    assert.equal(
      isSafeAttachmentUrl({ href: "data:image/png;base64,abc", mediaType: "image/png" }),
      true,
    );
    assert.equal(
      isSafeAttachmentUrl({ href: "data:text/html;base64,abc", mediaType: "text/html" }),
      false,
    );
    assert.equal(
      isSafeAttachmentUrl({ href: "data:image/svg+xml;base64,abc", mediaType: "image/svg+xml" }),
      false,
    );
    assert.equal(
      isSafeAttachmentUrl({ href: "data:text/plain;base64,abc", mediaType: "image/png" }),
      false,
    );
    assert.equal(
      isSafeAttachmentUrl({ href: "javascript:alert(1)", mediaType: "text/plain" }),
      false,
    );
  });
});
