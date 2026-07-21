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
    const worker = yield* DiscordBotWorker;

    return {
      url: worker.url.as<string>(),
    };
  }).pipe(Effect.provide(DiscordBotWorkerLive)),
);
