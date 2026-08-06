import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import {
  attachmentObjectIdsFromParts,
  attachmentUrlPrefix,
  deleteAttachmentObjectsEffect,
  externalizePartsEffect,
  maxStoredMessagePartsBytes,
  messagePartsJsonBytes,
  resolvePartsEffect,
  type ReadWriteBucketClient,
} from "../../src/cloudflare/chat-attachment-storage.ts";

const dataUrl = ({ bytes, mediaType = "image/jpeg" }: { bytes: number; mediaType?: string }) =>
  `data:${mediaType};base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

const makeFakeBucket = () => {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const bucket = {
    put: (key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) =>
      Effect.sync(() => {
        const contentType = options?.httpMetadata?.contentType ?? "application/octet-stream";
        objects.set(key, { bytes: value, contentType });
        return { key, size: value.byteLength, httpMetadata: { contentType } };
      }),
    get: (key: string) =>
      Effect.sync(() => {
        const object = objects.get(key);
        if (object === undefined) return null;
        return {
          key,
          size: object.bytes.byteLength,
          httpMetadata: { contentType: object.contentType },
          bytes: () => Effect.succeed(object.bytes),
        };
      }),
    delete: (keys: string | string[]) =>
      Effect.sync(() => {
        for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
      }),
  };
  return { bucket: bucket as unknown as ReadWriteBucketClient, objects };
};

const run = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(RuntimeContext.phantom)));

const asRecord = (value: unknown): Record<string, unknown> => {
  assert.ok(typeof value === "object" && value !== null);
  return value as Record<string, unknown>;
};

describe("cloudflare chat attachment storage", () => {
  it("externalizes UI and protocol file parts and skips text and already-externalized parts", async () => {
    const { bucket, objects } = makeFakeBucket();
    const photo = dataUrl({ bytes: 300_000 });
    const externalized = `${attachmentUrlPrefix}already-stored`;
    const parts = await run(
      externalizePartsEffect({
        userId: "user-a",
        bucket,
        parts: [
          { type: "text", text: "hello" },
          { type: "file", url: photo, mediaType: "image/jpeg", filename: "ui-photo.jpg" },
          { type: "file", file: { url: photo, mediaType: "image/png", name: "protocol.png" } },
          { type: "file", url: externalized, mediaType: "image/jpeg" },
        ],
      }),
    );

    assert.equal(objects.size, 2);
    const [first, second] = [...objects.entries()];
    assert.match(first?.[0] ?? "", /^user\/user-a\/[a-z0-9-]+$/);
    assert.equal(first?.[1].contentType, "image/jpeg");
    assert.equal(second?.[1].contentType, "image/jpeg");
    assert.equal(asRecord(parts[0]).type, "text");
    assert.match(String(asRecord(parts[1]).url ?? ""), new RegExp(`^${attachmentUrlPrefix}`));
    assert.match(
      String(asRecord(asRecord(parts[2]).file).url ?? ""),
      new RegExp(`^${attachmentUrlPrefix}`),
    );
    assert.equal(asRecord(parts[3]).url, externalized);
  });

  it("resolves both stored part shapes back to data URLs with a per-request cache", async () => {
    const { bucket, objects } = makeFakeBucket();
    const photo = dataUrl({ bytes: 90_000 });
    const externalized = await run(
      externalizePartsEffect({
        userId: "user-a",
        bucket,
        parts: [{ type: "file", url: photo, mediaType: "image/jpeg" }],
      }),
    );
    const url = externalized[0] === undefined ? "" : String(asRecord(externalized[0]).url ?? "");

    const resolved = await run(
      resolvePartsEffect({
        userId: "user-a",
        bucket,
        parts: [
          { type: "file", url, mediaType: "image/jpeg" },
          { type: "file", file: { url, mediaType: "image/jpeg" } },
        ],
      }),
    );

    assert.equal(objects.size, 1);
    assert.equal(asRecord(resolved[0]).url, photo);
    assert.equal(asRecord(asRecord(resolved[1]).file).url, photo);
  });

  it("collects unique externalized object ids from stored message parts", () => {
    assert.deepEqual(
      attachmentObjectIdsFromParts([
        { type: "text", text: "x" },
        { type: "file", url: `${attachmentUrlPrefix}object-1`, mediaType: "image/jpeg" },
        { type: "file", file: { url: `${attachmentUrlPrefix}object-1` } },
        { type: "file", file: { url: `${attachmentUrlPrefix}object-2` } },
        { type: "file", url: "data:image/jpeg;base64,AA==", mediaType: "image/jpeg" },
      ]),
      ["object-1", "object-2"],
    );
  });

  it("deletes user-scoped attachment objects for parsed message rows", async () => {
    const { bucket, objects } = makeFakeBucket();
    const photo = dataUrl({ bytes: 120_000 });
    const [part] = await run(
      externalizePartsEffect({
        userId: "user-a",
        bucket,
        parts: [{ type: "file", url: photo, mediaType: "image/jpeg" }],
      }),
    );
    const objectId =
      part === undefined ? "" : String(asRecord(part).url ?? "").slice(attachmentUrlPrefix.length);
    objects.set(`user/user-b/${objectId}`, { bytes: new Uint8Array(4), contentType: "image/jpeg" });

    const deleted = await run(
      deleteAttachmentObjectsEffect({
        userId: "user-a",
        bucket,
        messages: [
          { parts: JSON.stringify([{ type: "file", url: `${attachmentUrlPrefix}${objectId}` }]) },
          { parts: "not-json" },
        ],
      }),
    );

    assert.equal(deleted, 1);
    assert.equal(objects.has(`user/user-a/${objectId}`), false);
    assert.equal(objects.has(`user/user-b/${objectId}`), true);
  });

  it("keeps persisted message JSON below the D1 row ceiling", () => {
    const externalized = Array.from({ length: 10 }, (_, index) => ({
      type: "file",
      url: `${attachmentUrlPrefix}object-${index}`,
      mediaType: "image/jpeg",
    }));
    assert.ok(messagePartsJsonBytes(externalized) < maxStoredMessagePartsBytes);
    assert.ok(
      messagePartsJsonBytes([{ type: "text", text: "x".repeat(2_000_000) }]) >
        maxStoredMessagePartsBytes,
    );
  });
});
