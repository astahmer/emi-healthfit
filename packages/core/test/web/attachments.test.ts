import { describe, expect, it } from "vitest";
import {
  AttachmentValidationError,
  validateAttachments,
} from "../../src/web/attachments/attachments.ts";

describe("attachment validation", () => {
  it("enforces the ten-file conversation limit", () => {
    const files = [new File(["x"], "one.png", { type: "image/png" })];
    expect(() => validateAttachments({ files, existingCount: 10 })).toThrow(
      AttachmentValidationError,
    );
  });

  it("explains unsupported clipboard image formats", () => {
    const files = [new File(["x"], "clipboard.tiff", { type: "image/tiff" })];
    expect(() => validateAttachments({ files, existingCount: 0 })).toThrow(
      /PNG, JPEG, WebP, or GIF/,
    );
  });

  it("matches the Worker payload limit before encoding files as data URLs", () => {
    const files = [
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.txt", { type: "text/plain" }),
    ];

    expect(() => validateAttachments({ files, existingCount: 0 })).toThrow(/5 MB/);
  });
});
