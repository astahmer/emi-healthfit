import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { UIMessage } from "ai";

export type ReadWriteBucketClient = Effect.Success<
  ReturnType<typeof Cloudflare.R2.ReadWriteBucket>
>;

export const attachmentUrlPrefix = "/api/attachments/";

class AttachmentStorageError extends Schema.TaggedErrorClass<AttachmentStorageError>()(
  "AttachmentStorageError",
  {
    code: Schema.String,
    message: Schema.String,
  },
) {}

type UiMessagePart = UIMessage["parts"][number];

const isFileUrlPart = (part: UiMessagePart): part is Extract<UiMessagePart, { type: "file" }> =>
  part.type === "file";

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

export const externalizeMessageAttachmentsEffect = Effect.fn("chat.attachments.externalize")(
  function* ({
    userId,
    messages,
    bucket,
  }: {
    userId: string;
    messages: ReadonlyArray<UIMessage>;
    bucket: ReadWriteBucketClient;
  }) {
    return yield* Effect.forEach(messages, (message) =>
      Effect.gen(function* () {
        const parts = yield* Effect.forEach(
          message.parts,
          (part): Effect.Effect<UiMessagePart, AttachmentStorageError, RuntimeContext> => {
            if (!isFileUrlPart(part) || !part.url.startsWith("data:")) {
              return Effect.succeed(part);
            }
            return uploadDataUrl({ userId, bucket, dataUrl: part.url }).pipe(
              Effect.map((url) => ({ ...part, url })),
            );
          },
        );
        return { ...message, parts };
      }),
    );
  },
);

export const resolveExternalizedAttachmentsEffect = Effect.fn("chat.attachments.resolve")(
  function* ({
    userId,
    messages,
    bucket,
  }: {
    userId: string;
    messages: ReadonlyArray<UIMessage>;
    bucket: ReadWriteBucketClient;
  }) {
    const cache = new Map<string, string>();
    const resolveUrl = (
      url: string,
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
        const mediaType = object.httpMetadata?.contentType ?? "application/octet-stream";
        const dataUrl = bytesToDataUrl({
          mediaType,
          bytes: yield* object.bytes().pipe(Effect.mapError(toStorageError)),
        });
        cache.set(objectId, dataUrl);
        return dataUrl;
      });
    };

    return yield* Effect.forEach(messages, (message) =>
      Effect.gen(function* () {
        const parts = yield* Effect.forEach(
          message.parts,
          (part): Effect.Effect<UiMessagePart, AttachmentStorageError, RuntimeContext> => {
            if (!isFileUrlPart(part)) return Effect.succeed(part);
            return resolveUrl(part.url).pipe(Effect.map((url) => ({ ...part, url })));
          },
        );
        return { ...message, parts };
      }),
    );
  },
);

export const isValidAttachmentObjectId = (value: string): boolean =>
  /^[a-z0-9-]{8,64}$/.test(value) && !value.includes("..");
