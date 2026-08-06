import * as Effect from "effect/Effect";
import type { ReadWriteBucketClient } from "@emi/core/cloudflare";

export interface FakeStoredObject {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export const makeFakeBucket = () => {
  const objects = new Map<string, FakeStoredObject>();
  const asBytes = (value: Uint8Array | ArrayBuffer | string): Uint8Array => {
    if (value instanceof Uint8Array) return value;
    if (typeof value === "string") return new TextEncoder().encode(value);
    return new Uint8Array(value);
  };
  const bucket = {
    put: (
      key: string,
      value: Uint8Array | ArrayBuffer | string,
      options?: { httpMetadata?: { contentType?: string } },
    ) =>
      Effect.sync(() => {
        const bytes = asBytes(value);
        const contentType = options?.httpMetadata?.contentType ?? "application/octet-stream";
        objects.set(key, { key, bytes, contentType });
        return { key, size: bytes.byteLength, httpMetadata: { contentType } };
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
  };
  return { bucket: bucket as unknown as ReadWriteBucketClient, objects };
};
