import {
  DEFAULT_MAX_TIMESTAMP_SKEW_MS,
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  isTimestampStale,
  verifyEd25519Signature,
} from "./discord/crypto.ts";
import type {
  TimestampFreshnessOptions as TimestampFreshnessOptionsType,
  VerifyEd25519SignatureInput as VerifyEd25519SignatureInputType,
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
import type { DiscordHttpResponse as DiscordHttpResponseType } from "./discord/responses.ts";
import { editDeferredInteractionResponse } from "./discord/follow-up.ts";
import {
  InvalidSignature,
  MalformedInteraction,
  MissingSignatureHeaders,
  StaleTimestamp,
  verifyDiscordRequest,
} from "./discord/verify-request.ts";
import type {
  VerifyDiscordRequestError as VerifyDiscordRequestErrorType,
  VerifyDiscordRequestInput as VerifyDiscordRequestInputType,
} from "./discord/verify-request.ts";

export class Discord {
  private constructor() {}

  static readonly crypto = {
    defaultMaxTimestampSkewMs: DEFAULT_MAX_TIMESTAMP_SKEW_MS,
    ed25519PublicKeyBytes: ED25519_PUBLIC_KEY_BYTES,
    ed25519SignatureBytes: ED25519_SIGNATURE_BYTES,
    isTimestampStale,
    verifyEd25519Signature,
  } as const;

  static readonly interactions = {
    applicationCommandData: ApplicationCommandData,
    applicationCommandInteraction: ApplicationCommandInteraction,
    decode: decodeDiscordInteraction,
    ephemeralFlag: DISCORD_EPHEMERAL_FLAG,
    interaction: DiscordInteraction,
    ping: PingInteraction,
    responseType: DiscordInteractionResponseType,
    type: DiscordInteractionType,
  } as const;

  static readonly requests = {
    errors: {
      InvalidSignature,
      MalformedInteraction,
      MissingSignatureHeaders,
      StaleTimestamp,
    },
    verify: verifyDiscordRequest,
  } as const;

  static readonly responses = {
    badRequest: badRequestResponse,
    deferredEphemeral: deferredEphemeralResponse,
    ephemeralMessage: ephemeralMessageResponse,
    pong: pongResponse,
    unauthorized: unauthorizedResponse,
  } as const;

  static readonly followUp = {
    editDeferred: editDeferredInteractionResponse,
  } as const;
}

export namespace Discord {
  export type ApplicationCommandData = typeof ApplicationCommandData.Type;
  export type ApplicationCommandInteraction = typeof ApplicationCommandInteraction.Type;
  export type HttpResponse = DiscordHttpResponseType;
  export type Interaction = typeof DiscordInteraction.Type;
  export type Ping = typeof PingInteraction.Type;
  export type TimestampFreshnessOptions = TimestampFreshnessOptionsType;
  export type VerifyDiscordRequestError = VerifyDiscordRequestErrorType;
  export type VerifyDiscordRequestInput = VerifyDiscordRequestInputType;
  export type VerifyEd25519SignatureInput = VerifyEd25519SignatureInputType;
}
