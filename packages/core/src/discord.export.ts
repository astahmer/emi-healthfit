import {
  DEFAULT_MAX_TIMESTAMP_SKEW_MS,
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  isTimestampStale,
  verifyEd25519Signature,
} from "./discord/crypto.ts";
import type {
  TimestampFreshnessOptions,
  VerifyEd25519SignatureInput,
} from "./discord/crypto.ts";
import {
  ApplicationCommandData,
  ApplicationCommandInteraction,
  decodeDiscordInteraction,
  DISCORD_EPHEMERAL_FLAG,
  DiscordInteraction,
  DiscordInteractionResponseType,
  DiscordInteractionType,
  PingInteraction,
} from "./discord/interaction-types.ts";
import {
  badRequestResponse,
  deferredEphemeralResponse,
  ephemeralMessageResponse,
  pongResponse,
  unauthorizedResponse,
} from "./discord/responses.ts";
import { editDeferredInteractionResponse } from "./discord/follow-up.ts";
import {
  InvalidSignature,
  MalformedInteraction,
  MissingSignatureHeaders,
  StaleTimestamp,
  verifyDiscordRequest,
} from "./discord/verify-request.ts";
import type {
  DiscordHttpResponse,
} from "./discord/responses.ts";
import type {
  VerifyDiscordRequestError,
  VerifyDiscordRequestInput,
} from "./discord/verify-request.ts";

export {
  ApplicationCommandData,
  ApplicationCommandInteraction,
  badRequestResponse,
  decodeDiscordInteraction,
  DEFAULT_MAX_TIMESTAMP_SKEW_MS,
  deferredEphemeralResponse,
  DISCORD_EPHEMERAL_FLAG,
  DiscordInteraction,
  DiscordInteractionResponseType,
  DiscordInteractionType,
  editDeferredInteractionResponse,
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  ephemeralMessageResponse,
  InvalidSignature,
  isTimestampStale,
  MalformedInteraction,
  MissingSignatureHeaders,
  PingInteraction,
  pongResponse,
  StaleTimestamp,
  unauthorizedResponse,
  verifyDiscordRequest,
  verifyEd25519Signature,
};

export type {
  DiscordHttpResponse,
  TimestampFreshnessOptions,
  VerifyDiscordRequestError,
  VerifyDiscordRequestInput,
  VerifyEd25519SignatureInput,
};
