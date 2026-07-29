import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { DiscordInteractionType } from "../../src/discord/interaction-types.ts";
import {
  InvalidSignature,
  MalformedInteraction,
  MissingSignatureHeaders,
  StaleTimestamp,
  verifyDiscordRequest,
} from "../../src/discord/verify-request.ts";
import { exportPublicKeyHex, generateDiscordKeyPair, signInteractionBody } from "./support.ts";

const NOW_MS = 1_700_000_000_000;

const makeSignedRequest = async (
  privateKey: CryptoKey,
  body: unknown,
  timestampSeconds = String(Math.floor(NOW_MS / 1000)),
) => {
  const rawBody = JSON.stringify(body);
  const signature = await signInteractionBody(privateKey, timestampSeconds, rawBody);
  return { rawBody, signature, timestamp: timestampSeconds };
};

describe("verifyDiscordRequest", () => {
  it("decodes a Ping interaction from a validly signed, fresh request", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedRequest(privateKey, {
      id: "interaction-1",
      type: DiscordInteractionType.Ping,
    });

    const interaction = await Effect.runPromise(
      verifyDiscordRequest({ publicKeyHex, signature, timestamp, rawBody, nowMs: NOW_MS }),
    );
    assert.deepEqual(interaction, { id: "interaction-1", type: DiscordInteractionType.Ping });
  });

  it("decodes an ApplicationCommand interaction, keeping the subcommand tree intact", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const body = {
      id: "interaction-2",
      type: DiscordInteractionType.ApplicationCommand,
      token: "interaction-token",
      data: {
        id: "command-1",
        name: "healthfit",
        options: [{ name: "summary", type: 1 }],
      },
      user: { id: "discord-user-1", username: "astahmer" },
    };
    const { rawBody, signature, timestamp } = await makeSignedRequest(privateKey, body);

    const interaction = await Effect.runPromise(
      verifyDiscordRequest({ publicKeyHex, signature, timestamp, rawBody, nowMs: NOW_MS }),
    );
    assert.deepEqual(interaction, body);
  });

  it("fails with MissingSignatureHeaders when the signature header is absent", async () => {
    const { publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);

    const error = await Effect.runPromise(
      Effect.flip(
        verifyDiscordRequest({
          publicKeyHex,
          signature: null,
          timestamp: String(Math.floor(NOW_MS / 1000)),
          rawBody: "{}",
          nowMs: NOW_MS,
        }),
      ),
    );
    assert.ok(error instanceof MissingSignatureHeaders);
  });

  it("fails with MissingSignatureHeaders when the timestamp header is absent", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const timestamp = String(Math.floor(NOW_MS / 1000));
    const rawBody = JSON.stringify({ id: "x", type: DiscordInteractionType.Ping });
    const signature = await signInteractionBody(privateKey, timestamp, rawBody);

    const error = await Effect.runPromise(
      Effect.flip(
        verifyDiscordRequest({ publicKeyHex, signature, timestamp: null, rawBody, nowMs: NOW_MS }),
      ),
    );
    assert.ok(error instanceof MissingSignatureHeaders);
  });

  it("fails with InvalidSignature when the body was tampered with", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { signature, timestamp } = await makeSignedRequest(privateKey, {
      id: "interaction-1",
      type: DiscordInteractionType.Ping,
    });
    const tamperedBody = JSON.stringify({ id: "interaction-1", type: 999 });

    const error = await Effect.runPromise(
      Effect.flip(
        verifyDiscordRequest({
          publicKeyHex,
          signature,
          timestamp,
          rawBody: tamperedBody,
          nowMs: NOW_MS,
        }),
      ),
    );
    assert.ok(error instanceof InvalidSignature);
  });

  it("fails with InvalidSignature when signed by a different key pair", async () => {
    const attacker = await generateDiscordKeyPair();
    const { publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedRequest(attacker.privateKey, {
      id: "interaction-1",
      type: DiscordInteractionType.Ping,
    });

    const error = await Effect.runPromise(
      Effect.flip(
        verifyDiscordRequest({ publicKeyHex, signature, timestamp, rawBody, nowMs: NOW_MS }),
      ),
    );
    assert.ok(error instanceof InvalidSignature);
  });

  it("fails with StaleTimestamp when a validly signed request is too old", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const staleTimestamp = String(Math.floor(NOW_MS / 1000) - 10 * 60);
    const { rawBody, signature, timestamp } = await makeSignedRequest(
      privateKey,
      { id: "interaction-1", type: DiscordInteractionType.Ping },
      staleTimestamp,
    );

    const error = await Effect.runPromise(
      Effect.flip(
        verifyDiscordRequest({ publicKeyHex, signature, timestamp, rawBody, nowMs: NOW_MS }),
      ),
    );
    assert.ok(error instanceof StaleTimestamp);
  });

  it("fails with MalformedInteraction when the signed body is not JSON", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const timestamp = String(Math.floor(NOW_MS / 1000));
    const rawBody = "not-json";
    const signature = await signInteractionBody(privateKey, timestamp, rawBody);

    const error = await Effect.runPromise(
      Effect.flip(
        verifyDiscordRequest({ publicKeyHex, signature, timestamp, rawBody, nowMs: NOW_MS }),
      ),
    );
    assert.ok(error instanceof MalformedInteraction);
  });

  it("fails with MalformedInteraction for a well-signed but unsupported interaction type", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedRequest(privateKey, {
      id: "interaction-3",
      type: DiscordInteractionType.MessageComponent,
    });

    const error = await Effect.runPromise(
      Effect.flip(
        verifyDiscordRequest({ publicKeyHex, signature, timestamp, rawBody, nowMs: NOW_MS }),
      ),
    );
    assert.ok(error instanceof MalformedInteraction);
  });
});
