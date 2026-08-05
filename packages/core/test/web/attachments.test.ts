import { describe, expect, it } from "vitest";
import {
  AttachmentValidationError,
  isAnimatedWebp,
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
      /PNG, JPEG, WebP, GIF, or HEIC/,
    );
  });

  it("accepts iPhone HEIC and HEIF photos", () => {
    const files = [
      new File(["x"], "photo.heic", { type: "image/heic" }),
      new File(["y"], "photo.heif", { type: "image/heif" }),
    ];

    expect(() => validateAttachments({ files, existingCount: 0 })).not.toThrow();
  });

  it("accepts large iPhone originals up to the client cap", () => {
    const files = [
      new File([new Uint8Array(25 * 1024 * 1024)], "photo.heic", { type: "image/heic" }),
    ];

    expect(() => validateAttachments({ files, existingCount: 0 })).not.toThrow();
  });

  it("rejects originals above the client cap before encoding files as data URLs", () => {
    const files = [
      new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }),
    ];

    expect(() => validateAttachments({ files, existingCount: 0 })).toThrow(/25 MB/);
  });

  it("detects animated WebP files so they keep their animation", async () => {
    const animated = new File(["RIFF", "xxxx", "WEBP", "ANIM", "filler"], "meme.webp", {
      type: "image/webp",
    });
    const still = new File(["RIFF", "xxxx", "WEBP", "VP8 ", "filler"], "photo.webp", {
      type: "image/webp",
    });
    const png = new File(["not-webp"], "photo.png", { type: "image/png" });

    await expect(isAnimatedWebp(animated)).resolves.toBe(true);
    await expect(isAnimatedWebp(still)).resolves.toBe(false);
    await expect(isAnimatedWebp(png)).resolves.toBe(false);
  });
});
