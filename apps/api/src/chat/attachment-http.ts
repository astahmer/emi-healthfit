import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { isValidAttachmentObjectId, type ReadWriteBucketClient } from "./attachment-storage.ts";

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
    const user = yield* CoreCloudflare.user.CurrentUser;
    const object = yield* bucket.get(`user/${user.id}/${objectId}`);
    if (object === null) {
      return yield* HttpServerResponse.json({ error: "Attachment not found" }, { status: 404 });
    }
    const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
    return HttpServerResponse.fromWeb(
      new Response(Stream.toReadableStream(object.body), {
        headers: {
          "content-type": contentType,
          "cache-control": "private, max-age=3600",
        },
      }),
    );
  });
