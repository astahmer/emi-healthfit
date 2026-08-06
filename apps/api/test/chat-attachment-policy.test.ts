import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  maxStoredMessagePartsBytes,
  messagePartsJsonBytes,
} from "../src/chat/attachment-policy.ts";
import { validateAttachments } from "../src/chat/request-codec.ts";

const dataUrl = ({ bytes, mediaType = "image/jpeg" }: { bytes: number; mediaType?: string }) =>
  `data:${mediaType};base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

const filePart = (url: string) => ({ type: "file", url, mediaType: "image/jpeg" });

describe("chat attachment policy", () => {
  it("accepts three realistic iPhone photos in one message", () => {
    const photo = dataUrl({ bytes: 1_200_000 });
    assert.equal(
      validateAttachments([{ parts: [filePart(photo), filePart(photo), filePart(photo)] }]),
      undefined,
    );
  });

  it("rejects a single attachment above the per-file cap", () => {
    assert.match(
      validateAttachments([{ parts: [filePart(dataUrl({ bytes: 26 * 1024 * 1024 }))] }]) ?? "",
      /One attachment is too large/,
    );
  });

  it("rejects attachments that exceed the total per-message cap", () => {
    const photo = dataUrl({ bytes: 18 * 1024 * 1024 });
    assert.match(
      validateAttachments([{ parts: [filePart(photo), filePart(photo), filePart(photo)] }]) ?? "",
      /too large in total/,
    );
  });

  it("rejects more than ten attachments in one message", () => {
    assert.match(
      validateAttachments([{ parts: Array.from({ length: 11 }, () => filePart("https://x/y")) }]) ??
        "",
      /Too many attachments/,
    );
  });

  it("keeps persisted message JSON below the D1 row ceiling", () => {
    const externalized = Array.from({ length: 10 }, (_, index) => ({
      type: "file",
      url: `/api/attachments/object-${index}`,
      mediaType: "image/jpeg",
      filename: "photo.jpg",
    }));
    assert.ok(messagePartsJsonBytes(externalized) < maxStoredMessagePartsBytes);
    assert.ok(
      messagePartsJsonBytes([{ type: "text", text: "x".repeat(2_000_000) }]) >
        maxStoredMessagePartsBytes,
    );
  });
});
