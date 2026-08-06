import { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { UIMessage } from "ai";
import { CurrentUser } from "../server/auth/principal.ts";

export interface AttachmentBucketObject {
  readonly httpMetadata?: { readonly contentType?: string };
  bytes(): Effect.Effect<Uint8Array, unknown, RuntimeContext>;
}

export interface ReadWriteBucketClient {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Effect.Effect<unknown, unknown, RuntimeContext>;
  get(key: string): Effect.Effect<AttachmentBucketObject | null, unknown, RuntimeContext>;
  delete(keys: string | string[]): Effect.Effect<void, unknown, RuntimeContext>;
}

export const attachmentUrlPrefix = "/api/attachments/";

// Cloudflare D1 caps a single stored string/blob at 2 MB; keep a safety margin
// so persisted message JSON never trips SQLITE_TOOBIG.
export const maxStoredMessagePartsBytes = 1_800_000;

export class AttachmentStorageError extends Schema.TaggedErrorClass<AttachmentStorageError>()(
  "AttachmentStorageError",
  {
    code: Schema.String,
    message: Schema.String,
  },
) {}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFileUrlPart = (part: unknown): part is { type: "file"; url: string; mediaType?: string } =>
  isPlainObject(part) && part.type === "file" && typeof part.url === "string";

const isProtocolFilePart = (
  part: unknown,
): part is { type: "file"; file: { url: string; mediaType?: string } } =>
  isPlainObject(part) &&
  part.type === "file" &&
  isPlainObject(part.file) &&
  typeof part.file.url === "string";

const base64ToBytes = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));

const parseDataUrl = (
  value: string,
): { readonly mediaType: string; readonly bytes: Uint8Array } | { readonly error: string } => {
  const commaIndex = value.indexOf(",");
  if (!value.startsWith("data:") || commaIndex === -1) {
    return { error: "Unsupported attachment encoding" };
  }
  const metadata = value.slice("data:".length, commaIndex);
  const segments = metadata.split(";");
  if (!segments.includes("base64")) {
    return { error: "Unsupported attachment encoding" };
  }
  try {
    return {
      mediaType: segments[0] || "application/octet-stream",
      bytes: base64ToBytes(value.slice(commaIndex + 1)),
    };
  } catch {
    return { error: "Invalid base64 attachment" };
  }
};

const bytesToDataUrl = ({ mediaType, bytes }: { mediaType: string; bytes: Uint8Array }): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mediaType};base64,${btoa(binary)}`;
};

const externalizedObjectId = (url: string): string | null => {
  if (!url.startsWith(attachmentUrlPrefix)) return null;
  const objectId = url.slice(attachmentUrlPrefix.length);
  return objectId.length > 0 && !objectId.includes("/") ? objectId : null;
};

const toStorageError = (error: unknown): AttachmentStorageError =>
  new AttachmentStorageError({
    code: "attachment-storage-failed",
    message: error instanceof Error ? error.message : String(error),
  });

const uploadDataUrl = Effect.fn("chat.attachments.upload")(function* ({
  userId,
  bucket,
  dataUrl,
}: {
  userId: string;
  bucket: ReadWriteBucketClient;
  dataUrl: string;
}) {
  const parsed = parseDataUrl(dataUrl);
  if ("error" in parsed) {
    return yield* Effect.fail(
      new AttachmentStorageError({ code: "invalid-attachment", message: parsed.error }),
    );
  }
  const objectId = crypto.randomUUID();
  yield* bucket
    .put(`user/${userId}/${objectId}`, parsed.bytes, {
      httpMetadata: { contentType: parsed.mediaType },
    })
    .pipe(Effect.mapError(toStorageError));
  return `${attachmentUrlPrefix}${objectId}`;
});

const externalizePart = Effect.fn("chat.attachments.externalizePart")(function* ({
  userId,
  bucket,
  part,
}: {
  userId: string;
  bucket: ReadWriteBucketClient;
  part: unknown;
}) {
  if (isFileUrlPart(part)) {
    if (!part.url.startsWith("data:")) return part;
    const url = yield* uploadDataUrl({ userId, bucket, dataUrl: part.url });
    return { ...part, url };
  }
  if (isProtocolFilePart(part)) {
    if (!part.file.url.startsWith("data:")) return part;
    const url = yield* uploadDataUrl({ userId, bucket, dataUrl: part.file.url });
    return { ...part, file: { ...part.file, url } };
  }
  return part;
});

export const externalizePartsEffect = Effect.fn("chat.attachments.externalizeParts")(function* ({
  userId,
  parts,
  bucket,
}: {
  userId: string;
  parts: ReadonlyArray<unknown>;
  bucket: ReadWriteBucketClient;
}) {
  return yield* Effect.forEach(parts, (part) => externalizePart({ userId, bucket, part }));
});

export const externalizeMessageAttachmentsEffect = Effect.fn("chat.attachments.externalize")(
  ({
    userId,
    messages,
    bucket,
  }: {
    userId: string;
    messages: ReadonlyArray<UIMessage>;
    bucket: ReadWriteBucketClient;
  }) =>
    Effect.forEach(messages, (message) =>
      Effect.gen(function* () {
        const parts = yield* externalizePartsEffect({ userId, parts: message.parts, bucket });
        return { ...message, parts: parts as UIMessage["parts"] };
      }),
    ),
);

const resolvePart = Effect.fn("chat.attachments.resolvePart")(function* ({
  userId,
  bucket,
  cache,
  part,
}: {
  userId: string;
  bucket: ReadWriteBucketClient;
  cache: Map<string, string>;
  part: unknown;
}) {
  const resolveUrl = (
    url: string,
    mediaType: string | undefined,
  ): Effect.Effect<string, AttachmentStorageError, RuntimeContext> => {
    const objectId = externalizedObjectId(url);
    if (objectId === null) return Effect.succeed(url);
    const cached = cache.get(objectId);
    if (cached !== undefined) return Effect.succeed(cached);
    return Effect.gen(function* () {
      const object = yield* bucket
        .get(`user/${userId}/${objectId}`)
        .pipe(Effect.mapError(toStorageError));
      if (object === null) {
        return yield* Effect.fail(
          new AttachmentStorageError({
            code: "attachment-not-found",
            message: `Attachment not found: ${objectId}`,
          }),
        );
      }
      const dataUrl = bytesToDataUrl({
        mediaType: mediaType ?? object.httpMetadata?.contentType ?? "application/octet-stream",
        bytes: yield* object.bytes().pipe(Effect.mapError(toStorageError)),
      });
      cache.set(objectId, dataUrl);
      return dataUrl;
    });
  };

  if (isFileUrlPart(part)) {
    const url = yield* resolveUrl(part.url, part.mediaType);
    return { ...part, url };
  }
  if (isProtocolFilePart(part)) {
    const url = yield* resolveUrl(part.file.url, part.file.mediaType);
    return { ...part, file: { ...part.file, url } };
  }
  return part;
});

export const resolvePartsEffect = Effect.fn("chat.attachments.resolveParts")(function* ({
  userId,
  parts,
  bucket,
}: {
  userId: string;
  parts: ReadonlyArray<unknown>;
  bucket: ReadWriteBucketClient;
}) {
  const cache = new Map<string, string>();
  return yield* Effect.forEach(parts, (part) => resolvePart({ userId, bucket, cache, part }));
});

export const resolveExternalizedAttachmentsEffect = Effect.fn("chat.attachments.resolve")(
  ({
    userId,
    messages,
    bucket,
  }: {
    userId: string;
    messages: ReadonlyArray<UIMessage>;
    bucket: ReadWriteBucketClient;
  }) =>
    Effect.forEach(messages, (message) =>
      Effect.gen(function* () {
        const parts = yield* resolvePartsEffect({ userId, parts: message.parts, bucket });
        return { ...message, parts: parts as UIMessage["parts"] };
      }),
    ),
);

export const attachmentObjectIdsFromParts = (parts: ReadonlyArray<unknown>): string[] => {
  const ids: string[] = [];
  for (const part of parts) {
    const url = isFileUrlPart(part)
      ? part.url
      : isProtocolFilePart(part)
        ? part.file.url
        : undefined;
    const objectId = url === undefined ? null : externalizedObjectId(url);
    if (objectId !== null && !ids.includes(objectId)) ids.push(objectId);
  }
  return ids;
};

export const deleteAttachmentObjectsEffect = Effect.fn("chat.attachments.delete")(function* ({
  userId,
  bucket,
  messages,
}: {
  userId: string;
  bucket: ReadWriteBucketClient;
  messages: ReadonlyArray<{ parts: string }>;
}) {
  const ids = new Set<string>();
  const decodeParts = Schema.decodeUnknownOption(
    Schema.fromJsonString(Schema.Array(Schema.Unknown)),
  );
  for (const message of messages) {
    const parts = decodeParts(message.parts);
    if (Option.isNone(parts)) continue;
    for (const objectId of attachmentObjectIdsFromParts(parts.value)) ids.add(objectId);
  }
  if (ids.size === 0) return 0;
  yield* bucket
    .delete([...ids].map((objectId) => `user/${userId}/${objectId}`))
    .pipe(Effect.mapError(toStorageError));
  return ids.size;
});

export const messagePartsJsonBytes = (parts: ReadonlyArray<unknown>): number =>
  new TextEncoder().encode(JSON.stringify(parts)).byteLength;

export const isValidAttachmentObjectId = (value: string): boolean =>
  /^[a-z0-9-]{8,64}$/.test(value) && !value.includes("..");

export const handleAttachmentRead = ({
  bucket,
  objectId,
}: {
  bucket: ReadWriteBucketClient;
  objectId: string;
}) =>
  Effect.gen(function* () {
    if (!isValidAttachmentObjectId(objectId)) {
      return yield* HttpServerResponse.json({ error: "Attachment not found" }, { status: 404 });
    }
    const user = yield* CurrentUser;
    const object = yield* bucket.get(`user/${user.id}/${objectId}`);
    if (object === null) {
      return yield* HttpServerResponse.json({ error: "Attachment not found" }, { status: 404 });
    }
    const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
    const bytes = yield* object.bytes();
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return HttpServerResponse.fromWeb(
      new Response(buffer, {
        headers: {
          "content-type": contentType,
          "cache-control": "private, max-age=3600",
        },
      }),
    );
  });
