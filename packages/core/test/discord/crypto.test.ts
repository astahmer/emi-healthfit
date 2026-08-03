import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import {
  DEFAULT_MAX_TIMESTAMP_SKEW_MS,
  isTimestampStale,
  verifyEd25519Signature,
} from "../../src/discord/crypto.ts";
import { exportPublicKeyHex, generateDiscordKeyPair, signInteractionBody } from "./support.ts";

describe("verifyEd25519Signature", () => {
  it("accepts a signature produced over the exact timestamp+body message", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const timestamp = "1700000000";
    const rawBody = JSON.stringify({ type: 1 });
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const signatureHex = await signInteractionBody(privateKey, timestamp, rawBody);

    const valid = await Effect.runPromise(
      verifyEd25519Signature({ publicKeyHex, signatureHex, timestamp, rawBody }),
    );
    assert.equal(valid, true);
  });

  it("rejects a signature when the body was tampered with after signing", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const timestamp = "1700000000";
    const rawBody = JSON.stringify({ type: 1 });
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const signatureHex = await signInteractionBody(privateKey, timestamp, rawBody);

    const tamperedBody = JSON.stringify({ type: 2 });
    const valid = await Effect.runPromise(
      verifyEd25519Signature({ publicKeyHex, signatureHex, timestamp, rawBody: tamperedBody }),
    );
    assert.equal(valid, false);
  });

  it("rejects a signature verified against the wrong public key", async () => {
    const signer = await generateDiscordKeyPair();
    const attacker = await generateDiscordKeyPair();
    const timestamp = "1700000000";
    const rawBody = JSON.stringify({ type: 1 });
    const wrongPublicKeyHex = await exportPublicKeyHex(attacker.publicKey);
    const signatureHex = await signInteractionBody(signer.privateKey, timestamp, rawBody);

    const valid = await Effect.runPromise(
      verifyEd25519Signature({ publicKeyHex: wrongPublicKeyHex, signatureHex, timestamp, rawBody }),
    );
    assert.equal(valid, false);
  });

  it("rejects malformed hex without throwing", async () => {
    const valid = await Effect.runPromise(
      verifyEd25519Signature({
        publicKeyHex: "not-hex",
        signatureHex: "also-not-hex",
        timestamp: "1700000000",
        rawBody: "{}",
      }),
    );
    assert.equal(valid, false);
  });

  it("rejects a signature of the wrong byte length", async () => {
    const { publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const valid = await Effect.runPromise(
      verifyEd25519Signature({
        publicKeyHex,
        signatureHex: "aa",
        timestamp: "1700000000",
        rawBody: "{}",
      }),
    );
    assert.equal(valid, false);
  });
});

describe("isTimestampStale", () => {
  it("treats a timestamp within the skew window as fresh", () => {
    const nowMs = 1_700_000_000_000;
    const timestampSeconds = String(Math.floor(nowMs / 1000) - 10);
    assert.equal(isTimestampStale(timestampSeconds, { nowMs }), false);
  });

  it("treats a timestamp older than the default skew window as stale", () => {
    const nowMs = 1_700_000_000_000;
    const timestampSeconds = String(
      Math.floor((nowMs - DEFAULT_MAX_TIMESTAMP_SKEW_MS - 1000) / 1000),
    );
    assert.equal(isTimestampStale(timestampSeconds, { nowMs }), true);
  });

  it("treats a non-numeric timestamp as stale", () => {
    assert.equal(isTimestampStale("not-a-timestamp"), true);
  });

  it("honors a custom max skew", () => {
    const nowMs = 1_700_000_000_000;
    const timestampSeconds = String(Math.floor(nowMs / 1000) - 30);
    assert.equal(isTimestampStale(timestampSeconds, { nowMs, maxSkewMs: 10_000 }), true);
    assert.equal(isTimestampStale(timestampSeconds, { nowMs, maxSkewMs: 60_000 }), false);
  });
});
