import type {
  ApplicationCommandInteraction,
  DiscordHttpResponse,
} from "@emi/core-migration/discord";
import {
  deferredEphemeralResponse,
  editDeferredInteractionResponse,
} from "@emi/core-migration/discord";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  checkDiscordRateLimit,
  discordUserIdOf,
  truncateDiscordContent,
  type HealthfitCommandServices,
} from "./limits.ts";

const DISCORD_ASK_MAX_QUESTION_CHARS = 500;
const DISCORD_ASK_MAX_ANSWER_CHARS = 1800;

const DiscordAskApiResponse = Schema.Struct({
  answer: Schema.optional(Schema.String),
});

export const topLevelOptionString = (
  interaction: ApplicationCommandInteraction,
  optionName: string,
): string | undefined => {
  const entry = interaction.data.options?.find((option) => option.name === optionName);
  if (entry !== undefined && "value" in entry && typeof entry.value === "string") {
    return entry.value;
  }
  return undefined;
};

export const handleAskCommand = ({
  interaction,
  services,
  applicationId,
  botToken,
  apiBaseUrl,
  internalSecret,
  waitUntil,
}: {
  interaction: ApplicationCommandInteraction;
  services: HealthfitCommandServices;
  applicationId: string;
  botToken: string;
  apiBaseUrl: string;
  internalSecret: string;
  waitUntil: (promise: Promise<unknown>) => void;
}): DiscordHttpResponse => {
  const discordUserId = discordUserIdOf(interaction);
  if (discordUserId === undefined) {
    return deferredEphemeralResponse();
  }
  if (!checkDiscordRateLimit(discordUserId)) {
    waitUntil(
      Effect.runPromise(
        editDeferredInteractionResponse({
          applicationId,
          botToken,
          interactionToken: interaction.token,
          content: "Rate limit exceeded. Try again in a minute.",
        }),
      ),
    );
    return deferredEphemeralResponse();
  }

  const question = topLevelOptionString(interaction, "question")?.trim() ?? "";
  waitUntil(
    Effect.runPromise(
      Effect.gen(function* () {
        if (question === "" || question.length > DISCORD_ASK_MAX_QUESTION_CHARS) {
          yield* editDeferredInteractionResponse({
            applicationId,
            botToken,
            interactionToken: interaction.token,
            content: `Provide a question (max ${DISCORD_ASK_MAX_QUESTION_CHARS} chars): \`/ask question:...\``,
          });
          return;
        }
        const userId = yield* services.getLinkedUserId(discordUserId);
        if (userId === null) {
          yield* editDeferredInteractionResponse({
            applicationId,
            botToken,
            interactionToken: interaction.token,
            content:
              "Link your Discord account first: Settings → Generate code → `/healthfit link code:<code>`.",
          });
          return;
        }

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/discord/ask`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-discord-internal-secret": internalSecret,
              },
              body: JSON.stringify({ userId, question }),
            }),
          catch: (error) => new Error(`Discord ask API request failed: ${String(error)}`),
        });
        const bodyText = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (error) => new Error(`Could not read ask API body: ${String(error)}`),
        });
        if (!response.ok) {
          yield* Effect.logWarning("discord.ask.api_failed").pipe(
            Effect.annotateLogs({
              status: response.status,
              bodyPreview: bodyText.slice(0, 200),
            }),
          );
          yield* editDeferredInteractionResponse({
            applicationId,
            botToken,
            interactionToken: interaction.token,
            content: "Ask failed. Try again in a moment.",
          });
          return;
        }
        const parsed = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(DiscordAskApiResponse),
        )(bodyText).pipe(
          Effect.mapError((error) => new Error(`Ask API response shape invalid: ${String(error)}`)),
        );
        const answer =
          parsed.answer !== undefined && parsed.answer.trim() !== ""
            ? parsed.answer.trim()
            : "No answer returned.";
        yield* editDeferredInteractionResponse({
          applicationId,
          botToken,
          interactionToken: interaction.token,
          content: truncateDiscordContent(answer.slice(0, DISCORD_ASK_MAX_ANSWER_CHARS)),
        });
      }).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning("discord.ask.follow_up_failed").pipe(
              Effect.annotateLogs({ error: String(error) }),
            );
            yield* editDeferredInteractionResponse({
              applicationId,
              botToken,
              interactionToken: interaction.token,
              content: "Ask failed. Try again in a moment.",
            });
          }),
        ),
      ),
    ),
  );

  return deferredEphemeralResponse();
};
