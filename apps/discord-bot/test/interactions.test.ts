import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import * as Effect from "effect/Effect";
import { DiscordInteractionType, DiscordInteractionResponseType } from "@emi/core/discord";
import { handleInteractionsRequest } from "../src/routes/interactions.ts";
import {
  resetDiscordRateLimitsForTests,
  truncateDiscordContent,
  DISCORD_MAX_CONTENT_LENGTH,
  type HealthfitCommandServices,
} from "../src/commands/limits.ts";
import { healthfitCommandDefinition } from "../src/commands/definition.ts";
import { exportPublicKeyHex, generateDiscordKeyPair, signInteractionBody } from "./support.ts";

const makeSignedInteraction = async (privateKey: CryptoKey, body: unknown) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify(body);
  const signature = await signInteractionBody(privateKey, timestamp, rawBody);
  return { rawBody, signature, timestamp };
};

const applicationCommandBody = (
  subcommandName: string,
  options?: Array<{ name: string; type: number; value?: string }>,
) => ({
  id: "interaction-1",
  type: DiscordInteractionType.ApplicationCommand,
  token: "interaction-token",
  data: {
    id: "command-1",
    name: "healthfit",
    options: [{ name: subcommandName, type: 1, options }],
  },
  user: { id: "discord-user-1", username: "astahmer" },
});

const unlinkedServices = (): HealthfitCommandServices => ({
  getLinkedUserId: () => Effect.succeed(null),
  consumeLinkCode: () => Effect.succeed({ ok: false, reason: "invalid" }),
  unlinkDiscordUser: () => Effect.succeed(false),
  formatSummary: () => Effect.succeed("summary"),
  formatLastWorkout: () => Effect.succeed("last"),
  formatRecovery: () => Effect.succeed("recovery"),
});

const linkedServices = (): HealthfitCommandServices => ({
  getLinkedUserId: () => Effect.succeed("user-1"),
  consumeLinkCode: () => Effect.succeed({ ok: true, userId: "user-1" }),
  unlinkDiscordUser: () => Effect.succeed(true),
  formatSummary: () => Effect.succeed("Activity days: 3"),
  formatLastWorkout: () => Effect.succeed("Last workout: Push"),
  formatRecovery: () => Effect.succeed("Recovery: Favorable signals"),
});

describe("handleInteractionsRequest", () => {
  beforeEach(() => {
    resetDiscordRateLimitsForTests();
  });

  it("acknowledges a Ping with a Pong response", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(privateKey, {
      id: "interaction-0",
      type: DiscordInteractionType.Ping,
    });

    const response = await Effect.runPromise(
      handleInteractionsRequest({
        rawBody,
        signature,
        timestamp,
        publicKeyHex,
        services: unlinkedServices(),
      }),
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
        services: unlinkedServices(),
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
        services: unlinkedServices(),
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
      handleInteractionsRequest({
        rawBody,
        signature,
        timestamp: staleTimestamp,
        publicKeyHex,
        services: unlinkedServices(),
      }),
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
      handleInteractionsRequest({
        rawBody,
        signature,
        timestamp,
        publicKeyHex,
        services: unlinkedServices(),
      }),
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
        handleInteractionsRequest({
          rawBody,
          signature,
          timestamp,
          publicKeyHex,
          services: unlinkedServices(),
        }),
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
      handleInteractionsRequest({
        rawBody,
        signature,
        timestamp,
        publicKeyHex,
        services: unlinkedServices(),
      }),
    );
    const body = response.body as { data: { content: string } };
    assert.match(body.data.content, /no linked discord account/i);
  });

  it("asks for a Settings code when /healthfit link has no code option", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(
      privateKey,
      applicationCommandBody("link"),
    );

    const response = await Effect.runPromise(
      handleInteractionsRequest({
        rawBody,
        signature,
        timestamp,
        publicKeyHex,
        services: unlinkedServices(),
      }),
    );
    const body = response.body as { data: { content: string } };
    assert.match(body.data.content, /provide a code/i);
  });

  it("links successfully when the code is accepted", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(
      privateKey,
      applicationCommandBody("link", [{ name: "code", type: 3, value: "ABCD2345" }]),
    );

    const response = await Effect.runPromise(
      handleInteractionsRequest({
        rawBody,
        signature,
        timestamp,
        publicKeyHex,
        services: linkedServices(),
      }),
    );
    const body = response.body as { data: { content: string; flags: number } };
    assert.equal(body.data.flags, 64);
    assert.match(body.data.content, /linked/i);
  });

  it("returns owner-scoped ephemeral summaries for a linked user", async () => {
    const { privateKey, publicKey } = await generateDiscordKeyPair();
    const publicKeyHex = await exportPublicKeyHex(publicKey);
    const { rawBody, signature, timestamp } = await makeSignedInteraction(
      privateKey,
      applicationCommandBody("summary"),
    );

    const response = await Effect.runPromise(
      handleInteractionsRequest({
        rawBody,
        signature,
        timestamp,
        publicKeyHex,
        services: linkedServices(),
      }),
    );
    const body = response.body as { data: { content: string; flags: number } };
    assert.equal(body.data.flags, 64);
    assert.match(body.data.content, /activity days/i);
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
      handleInteractionsRequest({
        rawBody,
        signature,
        timestamp,
        publicKeyHex,
        services: unlinkedServices(),
      }),
    );
    const body = response.body as { data: { content: string } };
    assert.match(body.data.content, /unsupported command/i);
  });
});

describe("discord response limits", () => {
  it("truncates content to Discord's max length", () => {
    const content = "x".repeat(DISCORD_MAX_CONTENT_LENGTH + 50);
    const truncated = truncateDiscordContent(content);
    assert.equal(truncated.length, DISCORD_MAX_CONTENT_LENGTH);
    assert.equal(truncated.endsWith("…"), true);
  });
});

describe("discord command registration snapshot", () => {
  it("registers the MVP healthfit subcommands", () => {
    assert.equal(healthfitCommandDefinition.name, "healthfit");
    assert.deepEqual(
      healthfitCommandDefinition.options.map((option) => option.name),
      ["link", "summary", "last-workout", "recovery", "unlink"],
    );
  });
});
