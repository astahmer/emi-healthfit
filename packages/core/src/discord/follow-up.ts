import * as Effect from "effect/Effect";

const discordApiBase = "https://discord.com/api/v10";

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
    catch: (error) => new Error(`Discord deferred edit failed: ${String(error)}`),
  });
  if (!response.ok) {
    const bodyText = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) => new Error(`Could not read Discord edit body: ${String(error)}`),
    });
    return yield* Effect.fail(
      new Error(`Discord deferred edit HTTP ${response.status}: ${bodyText}`),
    );
  }
});
