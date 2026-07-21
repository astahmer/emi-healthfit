import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import { Stack } from "alchemy/Stack";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { coreAppDefinition } from "@emi/core-server";
import { handleInteractionsRequest } from "./routes/interactions.ts";

const DiscordEnvironment = Schema.Struct({
  DISCORD_PUBLIC_KEY: Schema.String.check(Schema.isMinLength(1)),
});

/**
 * Reads and decodes `env` per request rather than once at worker bootstrap. Cloudflare Workers
 * (and Alchemy's local bundle-validation smoke test, which runs the bootstrap effect against an
 * empty synthetic `env`) must not throw at module-init time just because a secret isn't bound yet
 * — only an actual `/interactions` request should require `DISCORD_PUBLIC_KEY` to be present.
 */
const interactionsRoute = Effect.fn("discord-bot.interactionsRoute")(function* (
  request: HttpServerRequest,
) {
  const env: Record<string, unknown> = yield* Cloudflare.Workers.WorkerEnvironment;
  const configuration = yield* Schema.decodeUnknownEffect(DiscordEnvironment)(env).pipe(
    Effect.orDie,
  );
  const rawBody = yield* request.text;
  const response = yield* handleInteractionsRequest({
    rawBody,
    signature: request.headers["x-signature-ed25519"],
    timestamp: request.headers["x-signature-timestamp"],
    publicKeyHex: configuration.DISCORD_PUBLIC_KEY,
  });
  return yield* HttpServerResponse.json(response.body, { status: response.status });
});

export class DiscordBotWorker extends Cloudflare.Worker<DiscordBotWorker, {}>()(
  "DiscordBotWorker",
) {}

export default DiscordBotWorker.make(
  Stack.useSync(() => ({
    main: import.meta.url,
    compatibility: { flags: ["nodejs_compat"] },
    env: {
      // Only DISCORD_PUBLIC_KEY is read by this Worker today. Application id and bot token are
      // provisioned now so a future registration/follow-up script can reuse the same deploy
      // secrets without a separate rollout.
      DISCORD_PUBLIC_KEY: Config.redacted("DISCORD_PUBLIC_KEY"),
      DISCORD_APPLICATION_ID: Config.redacted("DISCORD_APPLICATION_ID"),
      DISCORD_BOT_TOKEN: Config.redacted("DISCORD_BOT_TOKEN"),
    },
    observability: { enabled: true },
  })),
  Effect.gen(function* () {
    const router = yield* HttpRouter.make;
    yield* Effect.gen(function* () {
      yield* router.add("GET", "/health", () =>
        HttpServerResponse.json({
          name: coreAppDefinition.identity.name,
          description: coreAppDefinition.identity.description,
          transport: "discord",
        }),
      );
      yield* router.add("POST", "/interactions", interactionsRoute);
      yield* router.add("*", "/*", () =>
        Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 })),
      );
    }) as Effect.Effect<void>;

    return {
      fetch: router.asHttpEffect().pipe(
        Effect.scoped,
        Effect.catch((error) =>
          Effect.logError("Unhandled fetch error").pipe(
            Effect.annotateLogs({ error: String(error) }),
            Effect.as(HttpServerResponse.text("Internal Server Error", { status: 500 })),
          ),
        ),
        Effect.provide(RuntimeContext.phantom),
      ),
    };
  }),
);
