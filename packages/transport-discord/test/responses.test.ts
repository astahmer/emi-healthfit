import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISCORD_EPHEMERAL_FLAG,
  DiscordInteractionResponseType,
} from "../src/interaction-types.ts";
import {
  badRequestResponse,
  ephemeralMessageResponse,
  pongResponse,
  unauthorizedResponse,
} from "../src/responses.ts";

describe("pongResponse", () => {
  it("acknowledges a Ping with a Pong body and a 200 status", () => {
    assert.deepEqual(pongResponse(), {
      status: 200,
      body: { type: DiscordInteractionResponseType.Pong },
    });
  });
});

describe("ephemeralMessageResponse", () => {
  it("sets the ephemeral flag so health data is never posted visibly by default", () => {
    const response = ephemeralMessageResponse("hello");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      type: DiscordInteractionResponseType.ChannelMessageWithSource,
      data: { content: "hello", flags: DISCORD_EPHEMERAL_FLAG },
    });
  });
});

describe("unauthorizedResponse", () => {
  it("returns a 401 with the given message", () => {
    assert.deepEqual(unauthorizedResponse("invalid signature"), {
      status: 401,
      body: { error: "invalid signature" },
    });
  });
});

describe("badRequestResponse", () => {
  it("returns a 400 with the given message", () => {
    assert.deepEqual(badRequestResponse("bad body"), {
      status: 400,
      body: { error: "bad body" },
    });
  });
});
