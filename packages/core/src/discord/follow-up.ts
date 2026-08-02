import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const discordApiBase = "https://discord.com/api/v10";

export class DiscordFollowUpError extends Schema.TaggedErrorClass<DiscordFollowUpError>()(
  "DiscordFollowUpError",
  {
    phase: Schema.Literals(["request", "body", "response"]),
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

export const editDeferredInteractionResponse = Effect.fn("discord.editDeferred")(function* ({
  applicationId,
  botToken,
  interactionToken,
  content,
}: {
  applicationId: string;
  botToken: string;
  interactionToken: string;
  content: string;
}) {
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(`${discordApiBase}/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      }),
    catch: (error) =>
      new DiscordFollowUpError({
        phase: "request",
        message: `Discord deferred edit failed: ${String(error)}`,
      }),
  });
  if (!response.ok) {
    const bodyText = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) =>
        new DiscordFollowUpError({
          phase: "body",
          message: `Could not read Discord edit body: ${String(error)}`,
        }),
    });
    return yield* Effect.fail(
      new DiscordFollowUpError({
        phase: "response",
        message: `Discord deferred edit HTTP ${response.status}: ${bodyText}`,
        status: response.status,
      }),
    );
  }
});
