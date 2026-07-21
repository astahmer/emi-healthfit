import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import GenericWorkerLive, { GenericWorker } from "./src/generic.worker.ts";

export default Alchemy.Stack(
  "emi-generic",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.Database("GenericData", {
      migrationsDir: "./migrations",
    });

    const worker = yield* GenericWorker;

    return {
      url: worker.url.as<string>(),
      databaseId: db.databaseId,
    };
  }).pipe(Effect.provide(GenericWorkerLive)),
);
