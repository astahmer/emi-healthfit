import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { DiscordInteractionType, DiscordInteractionResponseType } from "@emi/transport-discord";
import { handleInteractionsRequest } from "../src/routes/interactions.ts";
import { exportPublicKeyHex, generateDiscordKeyPair, signInteractionBody } from "./support.ts";

const makeSignedInteraction = async (privateKey: CryptoKey, body: unknown) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify(body);
  const signature = await signInteractionBody(privateKey, timestamp, rawBody);
  return { rawBody, signature, timestamp };
};

const applicationCommandBody = (subcommandName: string) => ({
  id: "interaction-1",
  type: DiscordInteractionType.ApplicationCommand,
  token: "interaction-token",
  data: {
    id: "command-1",
    name: "healthfit",
    options: [{ name: subcommandName, type: 1 }],
  },
  user: { id: "discord-user-1", username: "astahmer" },
});

describe("handleInteractionsRequest", () => {
  it("acknowledges a Ping with a Pong response", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(privateKey, {
      id: "interaction-0",
      type: DiscordInteractionType.Ping,
    });

    const response = await Effect.runPromise(
      handleInteractionsRequest({ rawBody, signature, timestamp, publicKeyHex }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { type: DiscordInteractionResponseType.Pong });
  });

  it("returns 401 when the signature is missing", async () => {
    const { publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);

    const response = await Effect.runPromise(
      handleInteractionsRequest({
        rawBody: JSON.stringify({ id: "x", type: DiscordInteractionType.Ping }),
        signature: null,
        timestamp: String(Math.floor(Date.now() / 1000)),
        publicKeyHex,
      }),
    );
    assert.equal(response.status, 401);
  });

  it("returns 401 when the signature does not match the body", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { signature, timestamp } = await makeSignedInteraction(privateKey, {
      id: "interaction-0",
      type: DiscordInteractionType.Ping,
    });

    const response = await Effect.runPromise(
      handleInteractionsRequest({
        rawBody: JSON.stringify({ id: "interaction-0", type: 999 }),
        signature,
        timestamp,
        publicKeyHex,
      }),
    );
    assert.equal(response.status, 401);
  });

  it("returns 401 for a validly signed but stale request", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const rawBody = JSON.stringify({ id: "interaction-0", type: DiscordInteractionType.Ping });
    const signature = await signInteractionBody(privateKey, staleTimestamp, rawBody);

    const response = await Effect.runPromise(
      handleInteractionsRequest({ rawBody, signature, timestamp: staleTimestamp, publicKeyHex }),
    );
    assert.equal(response.status, 401);
  });

  it("fails closed with an ephemeral not-linked message for /healthfit summary", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(
      privateKey,
      applicationCommandBody("summary"),
    );

    const response = await Effect.runPromise(
      handleInteractionsRequest({ rawBody, signature, timestamp, publicKeyHex }),
    );
    assert.equal(response.status, 200);
    const body = response.body as { data: { content: string; flags: number } };
    assert.equal(body.data.flags, 64);
    assert.match(body.data.content, /isn't linked/i);
  });

  it("fails closed the same way for last-workout and recovery", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);

    for (const subcommand of ["last-workout", "recovery"]) {
      const { rawBody, signature, timestamp } = await makeSignedInteraction(
        privateKey,
        applicationCommandBody(subcommand),
      );
      const response = await Effect.runPromise(
        handleInteractionsRequest({ rawBody, signature, timestamp, publicKeyHex }),
      );
      const body = response.body as { data: { content: string } };
      assert.match(body.data.content, /isn't linked/i);
    }
  });

  it("reports no active link for /healthfit unlink", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(
      privateKey,
      applicationCommandBody("unlink"),
    );

    const response = await Effect.runPromise(
      handleInteractionsRequest({ rawBody, signature, timestamp, publicKeyHex }),
    );
    const body = response.body as { data: { content: string } };
    assert.match(body.data.content, /no linked discord account/i);
  });

  it("explains that linking codes are unavailable for /healthfit link", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(
      privateKey,
      applicationCommandBody("link"),
    );

    const response = await Effect.runPromise(
      handleInteractionsRequest({ rawBody, signature, timestamp, publicKeyHex }),
    );
    const body = response.body as { data: { content: string } };
    assert.match(body.data.content, /settings/i);
  });

  it("rejects an unsupported top-level command", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(privateKey, {
      id: "interaction-1",
      type: DiscordInteractionType.ApplicationCommand,
      token: "interaction-token",
      data: { id: "command-2", name: "other" },
    });

    const response = await Effect.runPromise(
      handleInteractionsRequest({ rawBody, signature, timestamp, publicKeyHex }),
    );
    const body = response.body as { data: { content: string } };
    assert.match(body.data.content, /unsupported command/i);
  });
});
