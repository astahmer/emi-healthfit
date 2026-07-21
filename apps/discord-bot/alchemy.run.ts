import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import DiscordBotWorkerLive, { DiscordBotWorker } from "./src/discord-bot.worker.ts";

export default Alchemy.Stack(
  "emi-discord-bot",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // GymData is owned by the API stack (migrations live there). This worker binds the same
    // logical D1 name via `Cloudflare.D1.Database("GymData")` in the worker module.
    // First deploy against the live API database: `pnpm discord:deploy:adopt`
    // (`alchemy deploy --adopt`). Plain deploy without adopt risks creating a second empty D1.
    // See plans/discord-bot.md decisions log.
    const worker = yield* DiscordBotWorker;

    return {
      url: worker.url.as<string>(),
    };
  }).pipe(Effect.provide(DiscordBotWorkerLive)),
);
