import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { fileURLToPath } from "node:url";

import { genericWorkerAppConfig } from "./src/app-config.ts";
import GenericWorkerLive, { GenericWorker } from "./src/generic.worker.ts";

export default Alchemy.Stack(
  "emi-generic",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.Database(genericWorkerAppConfig.databaseName, {
      migrationsDir: fileURLToPath(new URL("./migrations", import.meta.url)),
    });
    const attachmentsBucket = yield* Cloudflare.R2.Bucket("Attachments");

    const worker = yield* GenericWorker;

    return {
      url: worker.url.as<string>(),
      databaseId: db.databaseId,
      attachmentsBucketName: attachmentsBucket.bucketName,
    };
  }).pipe(Effect.provide(GenericWorkerLive)),
);
