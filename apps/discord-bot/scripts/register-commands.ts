import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { discordCommandDefinitions } from "../src/commands/definition.ts";

const RegistrationEnvironment = Schema.Struct({
  DISCORD_APPLICATION_ID: Schema.String.check(Schema.isMinLength(1)),
  DISCORD_BOT_TOKEN: Schema.String.check(Schema.isMinLength(1)),
  DISCORD_GUILD_ID: Schema.optional(Schema.String),
});

const registerCommands = Effect.fn("discord-bot.registerCommands")(function* () {
  const env = {
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  };
  const configuration = yield* Schema.decodeUnknownEffect(RegistrationEnvironment)(env);
  const applicationId = configuration.DISCORD_APPLICATION_ID;
  const token = configuration.DISCORD_BOT_TOKEN;
  const guildId = configuration.DISCORD_GUILD_ID;

  const url =
    guildId !== undefined && guildId !== ""
      ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${applicationId}/commands`;

  yield* Effect.logInfo(
    guildId !== undefined && guildId !== ""
      ? `Registering guild commands for guild ${guildId}`
      : "Registering global Discord application commands",
  );

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(discordCommandDefinitions),
      }),
    catch: (error) => new Error(`Discord registration request failed: ${String(error)}`),
  });

  const bodyText = yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (error) => new Error(`Could not read Discord registration response: ${String(error)}`),
  });

  if (!response.ok) {
    yield* Effect.logError("Discord command registration failed").pipe(
      Effect.annotateLogs({ status: response.status }),
    );
    return yield* Effect.fail(
      new Error(`Discord registration failed (${response.status}): ${bodyText}`),
    );
  }

  yield* Effect.logInfo("Discord command registration succeeded").pipe(
    Effect.annotateLogs({ bytes: bodyText.length }),
  );
  return bodyText;
});

const main = registerCommands().pipe(
  Effect.catch((error) =>
    Effect.logError("discord:register failed").pipe(
      Effect.annotateLogs({ error: String(error) }),
      Effect.flatMap(() => Effect.fail(error)),
    ),
  ),
);

await Effect.runPromise(main);
