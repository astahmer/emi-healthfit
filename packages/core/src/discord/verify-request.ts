import { Schema } from "effect";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { isTimestampStale, verifyEd25519Signature } from "./crypto.ts";
import { decodeDiscordInteraction } from "./interaction-types.ts";

const JsonUnknown = Schema.String.pipe(
  Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString),
);
export class MissingSignatureHeaders extends Schema.TaggedErrorClass<MissingSignatureHeaders>()(
  "MissingSignatureHeaders",
  {},
) {}

export class InvalidSignature extends Schema.TaggedErrorClass<InvalidSignature>()(
  "InvalidSignature",
  {},
) {}

export class StaleTimestamp extends Schema.TaggedErrorClass<StaleTimestamp>()(
  "StaleTimestamp",
  {},
) {}

export class MalformedInteraction extends Schema.TaggedErrorClass<MalformedInteraction>()(
  "MalformedInteraction",
  { message: Schema.String },
) {}

export type VerifyDiscordRequestError =
  | MissingSignatureHeaders
  | InvalidSignature
  | StaleTimestamp
  | MalformedInteraction;

export interface VerifyDiscordRequestInput {
  readonly publicKeyHex: string;
  readonly signature: string | null | undefined;
  readonly timestamp: string | null | undefined;
  readonly rawBody: string;
  readonly nowMs?: number;
  readonly maxSkewMs?: number;
}

/**
 * Verifies the Ed25519 signature over the exact raw body, rejects stale timestamps, then decodes
 * the body as a Discord interaction. Order matters: an unsigned or forged body is rejected before
 * its timestamp or JSON shape is ever inspected, so a `401` never depends on parsing attacker input.
 */
export const verifyDiscordRequest = Effect.fn("core.discord.verifyRequest")(function* (
  input: VerifyDiscordRequestInput,
) {
  if (!input.signature || !input.timestamp) {
    return yield* Effect.fail(new MissingSignatureHeaders());
  }

  const validSignature = yield* verifyEd25519Signature({
    publicKeyHex: input.publicKeyHex,
    signatureHex: input.signature,
    timestamp: input.timestamp,
    rawBody: input.rawBody,
  });
  if (!validSignature) return yield* Effect.fail(new InvalidSignature());

  if (isTimestampStale(input.timestamp, { nowMs: input.nowMs, maxSkewMs: input.maxSkewMs })) {
    return yield* Effect.fail(new StaleTimestamp());
  }

  const parsed = Schema.decodeUnknownOption(JsonUnknown)(input.rawBody);
  if (Option.isNone(parsed)) {
    return yield* Effect.fail(new MalformedInteraction({ message: "invalid JSON body" }));
  }

  return yield* decodeDiscordInteraction(parsed.value).pipe(
    Effect.mapError((error) => new MalformedInteraction({ message: String(error) })),
  );
});
