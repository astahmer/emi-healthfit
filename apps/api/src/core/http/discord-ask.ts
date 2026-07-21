import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  composeSystemPrompt,
  createConversation,
  getConversations,
  saveConversationMessages,
  type ConversationDatabaseSchema,
  type QueryDatabaseClient,
} from "@emi/core/server";
import { healthFitAppDefinition } from "@emi/flavor-healthfit";

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

export const handleDiscordAsk = Effect.fn("http.discord.ask")(function* ({
  db,
  environment,
  request,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema>;
  environment: Record<string, unknown>;
  request: HttpServerRequest;
}) {
  const config = yield* Schema.decodeUnknownEffect(DiscordAskEnvironment)(environment).pipe(
    Effect.mapError((error) => new Error(`Discord ask env invalid: ${String(error)}`)),
  );
  const provided = request.headers["x-discord-internal-secret"];
  if (provided !== config.DISCORD_INTERNAL_ASK_SECRET) {
    return yield* HttpServerResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = yield* request.text;
  const body = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DiscordAskBody))(
    rawBody,
  ).pipe(Effect.mapError((error) => new Error(`Invalid ask body: ${String(error)}`)));

  const conversations = yield* getConversations(db, body.userId);
  const existing = conversations.find((conversation) => conversation.title === DISCORD_ASK_TITLE);
  const conversationId =
    existing?.id ?? (yield* createConversation(db, body.userId, DISCORD_ASK_TITLE));

  const openai = createOpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL:
      config.OPENAI_BASE_URL !== undefined && config.OPENAI_BASE_URL !== ""
        ? config.OPENAI_BASE_URL
        : undefined,
  });
  const model = config.DISCORD_ASK_MODEL ?? "gpt-4o-mini";
  const system = composeSystemPrompt(healthFitAppDefinition.promptContributors);
  const result = yield* Effect.tryPromise({
    try: () =>
      generateText({
        model: openai.chat(model),
        system:
          `${system}\n\nYou are answering a Discord slash command. Keep the answer under 1500 characters. ` +
          `No markdown tables. Ephemeral guild-safe tone.`,
        prompt: body.question,
        maxOutputTokens: DISCORD_ASK_MAX_OUTPUT_TOKENS,
      }),
    catch: (error) => new Error(`Discord ask generation failed: ${String(error)}`),
  });

  const answer = result.text.trim();
  yield* saveConversationMessages(db, body.userId, conversationId, null, [
    { role: "user", parts: [{ type: "text", text: body.question }] },
    { role: "assistant", parts: [{ type: "text", text: answer }] },
  ]);

  return yield* HttpServerResponse.json({ answer, conversationId });
});
