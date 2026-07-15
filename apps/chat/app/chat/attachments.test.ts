import { describe, expect, it } from "vitest";
import { AttachmentValidationError, validateAttachments } from "./attachments";

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
});
