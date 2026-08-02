import { Effect } from "effect";
import { Discord } from "@emi/core/discord";

declare const interactionInput: unknown;
declare const requestInput: Discord.VerifyDiscordRequestInput;

const decoded: Effect.Effect<Discord.Interaction, unknown> =
  Discord.interactions.decode(interactionInput);
const verified: Effect.Effect<Discord.Interaction, Discord.VerifyDiscordRequestError> =
  Discord.requests.verify(requestInput);
const signature: Effect.Effect<boolean> = Discord.crypto.verifyEd25519Signature({
  publicKeyHex: "public-key",
  signatureHex: "signature",
  timestamp: "timestamp",
  rawBody: "{}",
});

void Discord.interactions.type.Ping;
void Discord.interactions.responseType.Pong;
void Discord.responses.pong();
void Discord.responses.ephemeralMessage("hello");
void Discord.followUp.editDeferred;
void decoded;
void verified;
void signature;
