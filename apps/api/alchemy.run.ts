import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import Api from "./src/api.worker.ts";


export default Alchemy.Stack(
  "emi-healthfit",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.Database("GymData", {
      migrationsDir: "./migrations",
    });

    const exportsBucket = yield* Cloudflare.R2.Bucket("Exports");

    const aiGateway = yield* Cloudflare.AI.Gateway("AiGateway");

    const api = yield* Api;

    return {
      url: api.url.as<string>(),
      databaseId: db.databaseId,
      bucketName: exportsBucket.bucketName,
      gatewayId: aiGateway.gatewayId,
    };
  }),
);
