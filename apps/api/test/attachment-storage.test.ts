import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import type { UIMessage } from "ai";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { makeFakeBucket } from "./fake-bucket.ts";

const {
  attachmentUrlPrefix,
  externalizeMessageAttachmentsEffect,
  resolveExternalizedAttachmentsEffect,
} = CoreCloudflare.attachments;

const dataUrl = ({ bytes, mediaType = "image/jpeg" }: { bytes: number; mediaType?: string }) =>
  `data:${mediaType};base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

const userMessage = (parts: UIMessage["parts"]): UIMessage => ({
  id: "user-1",
  role: "user",
  parts,
});

const run = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(RuntimeContext.phantom)));

describe("chat attachment storage", () => {
  it("externalizes base64 data URLs into the bucket and returns private URLs", async () => {
    const { bucket, objects } = makeFakeBucket();
    const photo = dataUrl({ bytes: 1_200_000 });
    const [message] = await run(
      externalizeMessageAttachmentsEffect({
        userId: "user-a",
        bucket,
        messages: [
          userMessage([
            { type: "text", text: "what is in this photo?" },
            { type: "file", url: photo, mediaType: "image/jpeg", filename: "meal.jpg" },
          ]),
        ],
      }),
    );

    const filePart = message?.parts[1];
    assert.equal(filePart?.type, "file");
    if (filePart?.type !== "file") return;
    assert.ok(filePart.url.startsWith(attachmentUrlPrefix));
    assert.equal(filePart.filename, "meal.jpg");
    assert.equal(objects.size, 1);
    const [stored] = [...objects.values()];
    assert.equal(stored?.contentType, "image/jpeg");
    assert.equal(stored?.bytes.byteLength, 1_200_000);
  });

  it("leaves text parts and non-data URLs untouched", async () => {
    const { bucket, objects } = makeFakeBucket();
    const [message] = await run(
      externalizeMessageAttachmentsEffect({
        userId: "user-a",
        bucket,
        messages: [
          userMessage([
            { type: "text", text: "plain text" },
            { type: "file", url: "https://example.com/photo.jpg", mediaType: "image/jpeg" },
          ]),
        ],
      }),
    );

    assert.equal(objects.size, 0);
    assert.equal(message?.parts[0]?.type, "text");
    assert.deepEqual(message?.parts[1], {
      type: "file",
      url: "https://example.com/photo.jpg",
      mediaType: "image/jpeg",
    });
  });

  it("resolves externalized URLs back to data URLs for the provider", async () => {
    const { bucket } = makeFakeBucket();
    const photo = dataUrl({ bytes: 900_000 });
    const [storedMessage] = await run(
      externalizeMessageAttachmentsEffect({
        userId: "user-a",
        bucket,
        messages: [userMessage([{ type: "file", url: photo, mediaType: "image/jpeg" }])],
      }),
    );

    const [resolvedMessage] = await run(
      resolveExternalizedAttachmentsEffect({
        userId: "user-a",
        bucket,
        messages: [storedMessage ?? userMessage([])],
      }),
    );

    const filePart = resolvedMessage?.parts[0];
    assert.equal(filePart?.type, "file");
    if (filePart?.type !== "file") return;
    assert.equal(filePart.url, photo);
  });

  it("keeps legacy data URLs unchanged when resolving history", async () => {
    const { bucket, objects } = makeFakeBucket();
    const photo = dataUrl({ bytes: 100_000 });
    const [message] = await run(
      resolveExternalizedAttachmentsEffect({
        userId: "user-a",
        bucket,
        messages: [userMessage([{ type: "file", url: photo, mediaType: "image/jpeg" }])],
      }),
    );

    assert.equal(objects.size, 0);
    assert.equal(message?.parts[0]?.type, "file");
    if (message?.parts[0]?.type !== "file") return;
    assert.equal(message.parts[0].url, photo);
  });

  it("fails clearly when a referenced attachment object is missing", async () => {
    const { bucket } = makeFakeBucket();
    const outcome = await Effect.runPromise(
      resolveExternalizedAttachmentsEffect({
        userId: "user-a",
        bucket,
        messages: [
          userMessage([
            { type: "file", url: `${attachmentUrlPrefix}missing-object`, mediaType: "image/jpeg" },
          ]),
        ],
      }).pipe(
        Effect.catch((error) => Effect.succeed({ error })),
        Effect.provide(RuntimeContext.phantom),
      ),
    );

    assert.equal("error" in outcome, true);
    if (!("error" in outcome)) return;
    assert.match(outcome.error.message, /Attachment not found/);
  });
});
