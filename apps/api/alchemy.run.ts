import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import ApiLive, { Api, DB } from "./src/api.worker.ts";

const state = process.env.ALCHEMY_LOCAL_STATE === "1" ? Alchemy.localState() : Cloudflare.state();

export default Alchemy.Stack(
  "emi-healthfit",
  {
    providers: Cloudflare.providers(),
    state,
  },
  Effect.gen(function* () {
    const db = yield* DB;

    const exportsBucket = yield* Cloudflare.R2.Bucket("Exports");
    const attachmentsBucket = yield* Cloudflare.R2.Bucket("Attachments");

    const api = yield* Api;

    return {
      url: api.url.as<string>(),
      databaseId: db.databaseId,
      bucketName: exportsBucket.bucketName,
      attachmentsBucketName: attachmentsBucket.bucketName,
    };
  }).pipe(Effect.provide(ApiLive)),
);
