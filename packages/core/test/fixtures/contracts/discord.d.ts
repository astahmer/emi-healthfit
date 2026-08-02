import type * as Effect from "effect/Effect";

export declare class Discord {
  static readonly crypto: {
    readonly defaultMaxTimestampSkewMs: number;
    readonly ed25519PublicKeyBytes: number;
    readonly ed25519SignatureBytes: number;
    readonly isTimestampStale: (
      timestampSeconds: string,
      options?: Discord.TimestampFreshnessOptions,
    ) => boolean;
    readonly verifyEd25519Signature: (
      input: Discord.VerifyEd25519SignatureInput,
    ) => Effect.Effect<boolean>;
  };
  static readonly interactions: {
    readonly applicationCommandData: unknown;
    readonly applicationCommandInteraction: unknown;
    readonly decode: (input: unknown) => Effect.Effect<Discord.Interaction, unknown>;
    readonly ephemeralFlag: number;
    readonly interaction: unknown;
    readonly ping: unknown;
    readonly responseType: {
      readonly Pong: number;
      readonly ChannelMessageWithSource: number;
      readonly DeferredChannelMessageWithSource: number;
    };
    readonly type: {
      readonly Ping: number;
      readonly ApplicationCommand: number;
    };
  };
  static readonly requests: {
    readonly errors: {
      readonly InvalidSignature: unknown;
      readonly MalformedInteraction: unknown;
      readonly MissingSignatureHeaders: unknown;
      readonly StaleTimestamp: unknown;
    };
    readonly verify: (
      input: Discord.VerifyDiscordRequestInput,
    ) => Effect.Effect<Discord.Interaction, Discord.VerifyDiscordRequestError>;
  };
  static readonly responses: {
    readonly badRequest: (message: string) => Discord.HttpResponse;
    readonly deferredEphemeral: () => Discord.HttpResponse;
    readonly ephemeralMessage: (content: string) => Discord.HttpResponse;
    readonly pong: () => Discord.HttpResponse;
    readonly unauthorized: (message: string) => Discord.HttpResponse;
  };
  static readonly followUp: {
    readonly editDeferred: (input: {
      readonly applicationId: string;
      readonly botToken: string;
      readonly interactionToken: string;
      readonly content: string;
    }) => Effect.Effect<void, unknown>;
  };
}

export declare namespace Discord {
  type ApplicationCommandData = unknown;
  type ApplicationCommandInteraction = {
    readonly id: string;
    readonly type: number;
    readonly token: string;
    readonly data: {
      readonly name: string;
      readonly options?: ReadonlyArray<unknown>;
    };
    readonly user?: { readonly id: string };
    readonly member?: { readonly user?: { readonly id: string } };
  };
  type HttpResponse = { readonly status: number; readonly body: unknown };
  type Interaction = { readonly id: string; readonly type: number } | ApplicationCommandInteraction;
  type Ping = { readonly id: string; readonly type: number };
  type TimestampFreshnessOptions = { readonly nowMs?: number; readonly maxSkewMs?: number };
  type VerifyDiscordRequestError = unknown;
  type VerifyDiscordRequestInput = {
    readonly publicKeyHex: string;
    readonly signature: string | null | undefined;
    readonly timestamp: string | null | undefined;
    readonly rawBody: string;
    readonly nowMs?: number;
    readonly maxSkewMs?: number;
  };
  type VerifyEd25519SignatureInput = {
    readonly publicKeyHex: string;
    readonly signatureHex: string;
    readonly timestamp: string;
    readonly rawBody: string;
  };
}
