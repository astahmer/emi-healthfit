import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { ServerDatabase } from "@emi/core/server/database";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";
import { SecureCompare } from "../auth/secure-compare.ts";

const DiscordAskBody = Schema.Struct({
  userId: Schema.String.check(Schema.isMinLength(1)),
  question: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
});

const DiscordAskEnvironment = Schema.Struct({
  DISCORD_INTERNAL_ASK_SECRET: Schema.String.check(Schema.isMinLength(16)),
  OPENAI_API_KEY: Schema.String.check(Schema.isMinLength(1)),
  OPENAI_BASE_URL: Schema.optional(Schema.String),
  DISCORD_ASK_MODEL: Schema.optional(Schema.String),
});

const DISCORD_ASK_TITLE = "[Discord] /ask";
const DISCORD_ASK_MAX_OUTPUT_TOKENS = 600;

const { buildContext: buildChatContext, renderContextPrompt } = HealthFit.chat;
const { definition: healthFitAppDefinition } = HealthFit.app;

export type DiscordAskGenerateAnswer = (input: {
  system: string;
  prompt: string;
  model: string;
  apiKey: string;
  baseURL: string | undefined;
  maxOutputTokens: number;
}) => Effect.Effect<string, Error>;

export const defaultDiscordAskGenerateAnswer: DiscordAskGenerateAnswer = (input) =>
  Effect.tryPromise({
    try: async () => {
      const openai = createOpenAI({
        apiKey: input.apiKey,
        baseURL: input.baseURL,
      });
      const result = await generateText({
        model: openai.chat(input.model),
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: input.maxOutputTokens,
      });
      return result.text.trim();
    },
    catch: (error) => new Error(`Discord ask generation failed: ${String(error)}`),
  });

/**
 * Internal bot→API mesh endpoint. The caller authenticates with
 * `x-discord-internal-secret`; the JSON `userId` is trusted once that secret
 * matches. Never expose the secret to browsers; rotate if leaked.
 */
export const handleDiscordAsk = Effect.fn("http.discord.ask")(function* ({
  db,
  environment,
  request,
  generateAnswer = defaultDiscordAskGenerateAnswer,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  request: HttpServerRequest;
  generateAnswer?: DiscordAskGenerateAnswer;
}) {
  const config = yield* Schema.decodeUnknownEffect(DiscordAskEnvironment)(environment).pipe(
    Effect.mapError((error) => new Error(`Discord ask env invalid: ${String(error)}`)),
  );
  const provided = request.headers["x-discord-internal-secret"];
  if (
    typeof provided !== "string" ||
    !SecureCompare.equals(provided, config.DISCORD_INTERNAL_ASK_SECRET)
  ) {
    return yield* HttpServerResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = yield* request.text;
  const body = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DiscordAskBody))(
    rawBody,
  ).pipe(Effect.mapError((error) => new Error(`Invalid ask body: ${String(error)}`)));

  const conversationDb = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(db);
  const healthfitDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);
  const conversationLayer = ServerDatabase.conversations.layer({ db: conversationDb });
  const provideConversationDatabase = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(conversationLayer));
  const conversations = yield* provideConversationDatabase(
    ServerDatabase.conversations.getConversations({ userId: body.userId }),
  );
  const existing = conversations.find((conversation) => conversation.title === DISCORD_ASK_TITLE);
  const conversationId =
    existing?.id ??
    (yield* provideConversationDatabase(
      ServerDatabase.conversations.createConversation({
        userId: body.userId,
        title: DISCORD_ASK_TITLE,
      }),
    ));

  const fitnessContext = yield* buildChatContext(healthfitDb, body.userId);
  const model = config.DISCORD_ASK_MODEL ?? "gpt-4o-mini";
  const system =
    `${ServerDatabase.app.composeSystemPrompt(healthFitAppDefinition.promptContributors)}\n\n` +
    `You are answering a Discord slash command. Keep the answer under 1500 characters. ` +
    `No markdown tables. Ephemeral guild-safe tone.`;
  const prompt = renderContextPrompt(fitnessContext, body.question);
  const answer = yield* generateAnswer({
    system,
    prompt,
    model,
    apiKey: config.OPENAI_API_KEY,
    baseURL:
      config.OPENAI_BASE_URL !== undefined && config.OPENAI_BASE_URL !== ""
        ? config.OPENAI_BASE_URL
        : undefined,
    maxOutputTokens: DISCORD_ASK_MAX_OUTPUT_TOKENS,
  });

  yield* provideConversationDatabase(
    ServerDatabase.conversations.saveConversationMessages({
      userId: body.userId,
      conversationId,
      parentId: null,
      messages: [
        { role: "user", parts: [{ type: "text", text: body.question }] },
        { role: "assistant", parts: [{ type: "text", text: answer }] },
      ],
    }),
  );

  return yield* HttpServerResponse.json({ answer, conversationId });
});
