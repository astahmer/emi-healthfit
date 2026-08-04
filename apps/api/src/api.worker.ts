import * as Cloudflare from "alchemy/Cloudflare";
import * as Command from "alchemy/Command";
import * as Output from "alchemy/Output";
import { RuntimeContext } from "alchemy";
import { Stack } from "alchemy/Stack";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { handleDiscordAsk } from "./discord/http/discord-ask.ts";
import { handleDiscordCommand } from "./discord/http/discord-command.ts";
import { makeQueryDatabaseClient, narrowQueryDatabaseClient } from "./platform/db/client.ts";
import { resolveEmiBuildId } from "./platform/emi-build-id.ts";
import {
  handleAiSdkChat,
  handleChatResume,
  handleConversationDiagnostics,
} from "./chat/generation-lifecycle.ts";
import {
  handleIngest,
  handleIngestedDataExport,
  handleIngestedDataImport,
  handleRecovery,
  handleSummary,
} from "./healthfit/routes/data.ts";
import { handleAssetRequest, handleCorsPreflight, withCors } from "./platform/http/assets-cors.ts";
import { registerHttpApi } from "./http-api.ts";
import {
  HealthFit,
  type HealthfitDatabaseSchema,
  type HealthfitToolsDatabaseSchema,
} from "@emi/flavor-healthfit";
import { ServerDatabase } from "@emi/core/server/database";
const { definition: healthFitAppDefinition } = HealthFit.app;
const { execute: executeHealthfitTool } = HealthFit.tools;
const { ensureFresh: ensureHevyFresh } = HealthFit.hevy;
const PRODUCTION_DOMAIN = "emi-healthfit.astahmer.dev";
const chatAppDirectory = "../chat";

const alchemyMigrationsDirectory = process.env.EMI_ALCHEMY_MIGRATIONS_DIR;
export const DB = Cloudflare.D1.Database(
  "GymData",
  alchemyMigrationsDirectory === undefined ? {} : { migrationsDir: alchemyMigrationsDirectory },
);
const ExportsBucket = Cloudflare.R2.Bucket("Exports");
const AssetsBinding = Schema.Struct({
  fetch: Schema.declare<(request: Request) => Promise<Response>>(
    (value): value is (request: Request) => Promise<Response> => typeof value === "function",
  ),
});
const cors = <E, R>({
  request,
  effect,
}: {
  request: HttpServerRequest;
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>;
}) => withCors(effect, request);

export class Api extends Cloudflare.Worker<Api, {}>()("Api") {}

export default Api.make(
  Effect.gen(function* () {
    const stack = yield* Stack;
    const buildId = resolveEmiBuildId({ stage: stack.stage });
    const releaseEnvironment = {
      EMI_BUILD_ID: buildId,
      EMI_CHANGE_ID: process.env.EMI_CHANGE_ID ?? "",
      EMI_COMMIT_ID: process.env.EMI_COMMIT_ID ?? "",
      EMI_RELEASED_AT: process.env.EMI_RELEASED_AT ?? "",
      EMI_RELEASE_HISTORY: process.env.EMI_RELEASE_HISTORY ?? "",
      EMI_RELEASE_VERSION: process.env.EMI_RELEASE_VERSION ?? "",
    };
    const chatAssets = yield* Command.Build("ChatAssets", {
      command: "pnpm exec vite build",
      cwd: chatAppDirectory,
      outdir: "dist",
      env: {
        ...releaseEnvironment,
        NODE_ENV: "production",
      },
      memo: {
        include: [
          "app/**",
          "components/**",
          "hooks/**",
          "lib/**",
          "public/**",
          "index.html",
          "package.json",
          "tsconfig.json",
          "vite.config.ts",
          "vite-env.d.ts",
        ],
      },
    });

    return {
      main: import.meta.url,
      domain: stack.stage === "prod" ? PRODUCTION_DOMAIN : undefined,
      assets: {
        directory: chatAssets.outdir,
        hash: chatAssets.hash.pipe(Output.map((hash) => hash.output ?? buildId)),
        notFoundHandling: "single-page-application" as const,
        // SPA fallback must not swallow /api/* (esp. Better Auth Google callback).
        runWorkerFirst: ["/api/*", "/ingest"],
      },
      compatibility: { flags: ["nodejs_compat"] },
      env: {
        BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
        BETTER_AUTH_URL: Config.redacted("BETTER_AUTH_URL"),
        GOOGLE_CLIENT_ID: Config.redacted("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: Config.redacted("GOOGLE_CLIENT_SECRET"),
        ALLOWED_EMAILS: Config.redacted("ALLOWED_EMAILS"),
        AGENT_AUTH_SECRET: Config.redacted("AGENT_AUTH_SECRET").pipe(Config.withDefault("")),
        AGENT_AUTH_EMAIL: Config.string("AGENT_AUTH_EMAIL").pipe(Config.withDefault("")),
        HEVY_CREDENTIAL_ENCRYPTION_KEY: Config.redacted("HEVY_CREDENTIAL_ENCRYPTION_KEY"),
        OPENAI_API_KEY: Config.redacted("OPENAI_API_KEY"),
        DISCORD_INTERNAL_ASK_SECRET: Config.redacted("DISCORD_INTERNAL_ASK_SECRET"),
        EMI_BUILD_ID: buildId,
      },
      observability: {
        enabled: true,
      },
    };
  }),
  Effect.gen(function* () {
    const query = yield* Cloudflare.D1.QueryDatabase(DB);
    const db = makeQueryDatabaseClient({
      query,
      runtime: {
        createId: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
        nowMilliseconds: () => Date.now(),
        randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      },
    });
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(ExportsBucket);
    const env: Record<string, unknown> = yield* Cloudflare.Workers.WorkerEnvironment;
    const assetsBinding = Schema.decodeUnknownOption(AssetsBinding)(env.ASSETS);
    const assetsFetcher = Option.isSome(assetsBinding)
      ? (request: Request): Promise<Response> => Promise.resolve(assetsBinding.value.fetch(request))
      : undefined;

    const router = yield* HttpRouter.make;
    yield* Effect.gen(function* () {
      yield* router.add("POST", "/ingest", (request) =>
        cors({ request, effect: handleIngest(db, bucket, request) }),
      );
      yield* router.add("POST", "/api/chat", (request) =>
        handleAiSdkChat(db, request, env, {
          beforeChat: ({ db: chatDb, userId, environment }) =>
            ensureHevyFresh({
              db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(chatDb),
              userId,
              environment,
            }),
          coachSystemPrompt: ServerDatabase.app.composeSystemPrompt(
            healthFitAppDefinition.promptContributors,
          ),
          tools: healthFitAppDefinition.tools ?? [],
          // Kysely schema invariance: narrow the app DatabaseSchema client to the
          // flavor tools schema at the composition boundary (see narrowQueryDatabaseClient).
          executeTool: (args) =>
            executeHealthfitTool({
              ...args,
              db: narrowQueryDatabaseClient<HealthfitToolsDatabaseSchema>(args.db),
            }),
        }),
      );
      yield* router.add("GET", "/api/chat/:conversationId/stream", (request) =>
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          return yield* handleChatResume(db, params.conversationId ?? "", request);
        }),
      );
      yield* router.add("GET", "/api/recovery", (request) =>
        cors({ request, effect: handleRecovery(db, env) }),
      );
      yield* router.add("GET", "/api/summary", (request) =>
        cors({ request, effect: handleSummary(db, env) }),
      );
      yield* router.add("GET", "/api/export/ingested-data", (request) =>
        cors({ request, effect: handleIngestedDataExport(db) }),
      );
      yield* router.add("POST", "/api/import/ingested-data", (request) =>
        cors({ request, effect: handleIngestedDataImport(db, request) }),
      );
      yield* router.add("GET", "/api/conversations/:conversationId/diagnostics", (request) =>
        cors({ request, effect: handleConversationDiagnostics(db, request) }),
      );
      yield* router.add("POST", "/api/discord/ask", (request) =>
        handleDiscordAsk({
          db,
          environment: env,
          request,
        }).pipe(
          Effect.catch((error) =>
            HttpServerResponse.json({ error: String(error) }, { status: 500 }),
          ),
        ),
      );
      yield* router.add("POST", "/api/discord/command", (request) =>
        handleDiscordCommand({
          db,
          environment: env,
          request,
        }).pipe(
          Effect.catch((error) =>
            HttpServerResponse.json({ error: String(error) }, { status: 500 }),
          ),
        ),
      );
      yield* registerHttpApi({ bucket, db, environment: env, router });
      yield* router.add("*", "/*", (request) => {
        if (request.method === "OPTIONS") return handleCorsPreflight(request);
        if (request.method === "GET") return handleAssetRequest({ assetsFetcher, request });
        return Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 }));
      });
    }) as Effect.Effect<void>;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        return yield* CoreCloudflare.auth.authenticateWorkerFetch({
          db,
          environment: env,
          isProtectedPath: (pathname) =>
            CoreCloudflare.auth.isProtectedPath(pathname) &&
            pathname !== "/api/discord/ask" &&
            pathname !== "/api/discord/command",
          policy: "google-allowlist",
          request,
          route: router.asHttpEffect(),
        });
      }).pipe(
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
  }).pipe(
    Effect.provide(
      Layer.mergeAll(Cloudflare.D1.QueryDatabaseBinding, Cloudflare.R2.ReadWriteBucketBinding),
    ),
  ),
);
