import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { coreAppDefinition } from "@emi/core/server/legacy";
import { makeHealthfitCommandServices } from "./commands/services.ts";
import { handleInteractionsRequest } from "./routes/interactions.ts";

const DiscordEnvironment = Schema.Struct({
  DISCORD_PUBLIC_KEY: Schema.String.check(Schema.isMinLength(1)),
  DISCORD_APPLICATION_ID: Schema.String.check(Schema.isMinLength(1)),
  DISCORD_BOT_TOKEN: Schema.String.check(Schema.isMinLength(1)),
  EMI_API_BASE_URL: Schema.String.check(Schema.isPattern(/^https?:\/\//)),
  DISCORD_INTERNAL_ASK_SECRET: Schema.String.check(Schema.isMinLength(16)),
});

const interactionsRoute = () =>
  Effect.fn("discord-bot.interactionsRoute")(function* (request: HttpServerRequest) {
    const env: Record<string, unknown> = yield* Cloudflare.Workers.WorkerEnvironment;
    const configuration = yield* Schema.decodeUnknownEffect(DiscordEnvironment)(env).pipe(
      Effect.orDie,
    );
    const executionContext = yield* Cloudflare.Workers.WorkerExecutionContext;
    const rawBody = yield* request.text;
    const response = yield* handleInteractionsRequest({
      rawBody,
      signature: request.headers["x-signature-ed25519"],
      timestamp: request.headers["x-signature-timestamp"],
      publicKeyHex: configuration.DISCORD_PUBLIC_KEY,
      services: makeHealthfitCommandServices({
        apiBaseUrl: configuration.EMI_API_BASE_URL,
        internalSecret: configuration.DISCORD_INTERNAL_ASK_SECRET,
      }),
      applicationId: configuration.DISCORD_APPLICATION_ID,
      botToken: configuration.DISCORD_BOT_TOKEN,
      apiBaseUrl: configuration.EMI_API_BASE_URL,
      internalSecret: configuration.DISCORD_INTERNAL_ASK_SECRET,
      waitUntil: (promise) => {
        executionContext.waitUntil(promise);
      },
    });
    return yield* HttpServerResponse.json(response.body, { status: response.status });
  });

export class DiscordBotWorker extends Cloudflare.Worker<DiscordBotWorker, {}>()(
  "DiscordBotWorker",
) {}

export default DiscordBotWorker.make(
  Effect.succeed({
    main: import.meta.url,
    compatibility: { flags: ["nodejs_compat"] },
    env: {
      DISCORD_PUBLIC_KEY: Config.redacted("DISCORD_PUBLIC_KEY"),
      DISCORD_APPLICATION_ID: Config.redacted("DISCORD_APPLICATION_ID"),
      DISCORD_BOT_TOKEN: Config.redacted("DISCORD_BOT_TOKEN"),
      EMI_API_BASE_URL: Config.redacted("EMI_API_BASE_URL"),
      DISCORD_INTERNAL_ASK_SECRET: Config.redacted("DISCORD_INTERNAL_ASK_SECRET"),
    },
    observability: { enabled: true },
  }),
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
      yield* router.add("POST", "/interactions", interactionsRoute());
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
