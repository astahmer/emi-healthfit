import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ConsumeLinkResult, HealthfitCommandServices } from "./limits.ts";

const RemoteResponse = Schema.Struct({ content: Schema.String });
const LinkedUserResponse = Schema.Struct({ userId: Schema.NullOr(Schema.String) });
const LinkCodeResponse = Schema.Struct({
  result: Schema.Union([
    Schema.Struct({ ok: Schema.Literal(true), userId: Schema.String }),
    Schema.Struct({
      ok: Schema.Literal(false),
      reason: Schema.Literals(["invalid", "expired", "consumed"]),
    }),
  ]),
});
const UnlinkResponse = Schema.Struct({ removed: Schema.Boolean });

const requestCommand = Effect.fn("discord.command.request")(function* ({
  apiBaseUrl,
  internalSecret,
  body,
}: {
  apiBaseUrl: string;
  internalSecret: string;
  body: Record<string, string>;
}) {
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/discord/command`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-discord-internal-secret": internalSecret,
        },
        body: JSON.stringify(body),
      }),
    catch: (error) => new Error(`Discord command request failed: ${String(error)}`),
  });
  const text = yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (error) => new Error(`Could not read Discord command response: ${String(error)}`),
  });
  if (!response.ok)
    return yield* Effect.fail(new Error(`Discord command failed (${response.status})`));
  return text;
});

const decodeLinkedUserResponse = (text: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(LinkedUserResponse))(text).pipe(
    Effect.mapError((error) => new Error(`Invalid Discord command response: ${String(error)}`)),
  );

const decodeLinkCodeResponse = (text: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(LinkCodeResponse))(text).pipe(
    Effect.mapError((error) => new Error(`Invalid Discord command response: ${String(error)}`)),
  );

const decodeUnlinkResponse = (text: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(UnlinkResponse))(text).pipe(
    Effect.mapError((error) => new Error(`Invalid Discord command response: ${String(error)}`)),
  );

const decodeContentResponse = (text: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(RemoteResponse))(text).pipe(
    Effect.mapError((error) => new Error(`Invalid Discord command response: ${String(error)}`)),
  );

export const makeHealthfitCommandServices = (options: {
  apiBaseUrl: string;
  internalSecret: string;
}): HealthfitCommandServices => ({
  getLinkedUserId: (discordUserId) =>
    requestCommand({ ...options, body: { operation: "get-linked-user-id", discordUserId } }).pipe(
      Effect.flatMap(decodeLinkedUserResponse),
      Effect.map((response) => response.userId),
      Effect.catch(() => Effect.succeed(null)),
    ),
  consumeLinkCode: ({ code, discordUserId }) =>
    requestCommand({
      ...options,
      body: { operation: "consume-link-code", code, discordUserId },
    }).pipe(
      Effect.flatMap(decodeLinkCodeResponse),
      Effect.map((response) => response.result),
      Effect.catch(() => Effect.succeed<ConsumeLinkResult>({ ok: false, reason: "invalid" })),
    ),
  unlinkDiscordUser: (discordUserId) =>
    requestCommand({ ...options, body: { operation: "unlink-discord-user", discordUserId } }).pipe(
      Effect.flatMap(decodeUnlinkResponse),
      Effect.map((response) => response.removed),
      Effect.catch(() => Effect.succeed(false)),
    ),
  formatSummary: (userId) =>
    requestCommand({ ...options, body: { operation: "summary", userId } }).pipe(
      Effect.flatMap(decodeContentResponse),
      Effect.map((response) => response.content),
      Effect.catch(() => Effect.succeed("Could not load your HealthFit summary right now.")),
    ),
  formatLastWorkout: (userId) =>
    requestCommand({ ...options, body: { operation: "last-workout", userId } }).pipe(
      Effect.flatMap(decodeContentResponse),
      Effect.map((response) => response.content),
      Effect.catch(() => Effect.succeed("Could not load your last workout right now.")),
    ),
  formatRecovery: (userId) =>
    requestCommand({ ...options, body: { operation: "recovery", userId } }).pipe(
      Effect.flatMap(decodeContentResponse),
      Effect.map((response) => response.content),
      Effect.catch(() => Effect.succeed("Could not load your recovery status right now.")),
    ),
});
