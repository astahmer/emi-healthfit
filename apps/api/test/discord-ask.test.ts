import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { fromWeb } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { ServerDatabase } from "@emi/core/server/database";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { handleDiscordAsk } from "../src/discord/http/discord-ask.ts";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeConversationDatabase, makeSqliteDatabase, run } from "./sqlite.ts";

const SECRET = "test-discord-ask-secret";
const environment = {
  DISCORD_INTERNAL_ASK_SECRET: SECRET,
  OPENAI_API_KEY: "test-openai-key",
};
const originalFetch = globalThis.fetch;
const { encryptApiKey: encryptHevyApiKey, upsertConnection: upsertHevyConnection } = HealthFit.hevy;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const makeAskRequest = ({ secret, body }: { secret?: string | null; body: unknown }) =>
  fromWeb(
    new Request("https://api.example.com/api/discord/ask", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret === null ? {} : { "x-discord-internal-secret": secret ?? SECRET }),
      },
      body: JSON.stringify(body),
    }),
  );

describe("handleDiscordAsk", () => {
  it("rejects missing or wrong internal secrets with 401", async () => {
    const { db } = makeSqliteDatabase();
    for (const secret of [null, "wrong-discord-ask-s", "x".repeat(SECRET.length)]) {
      const response = await run(
        handleDiscordAsk({
          db,
          environment,
          request: makeAskRequest({
            secret,
            body: { userId: "user-1", question: "How is recovery?" },
          }),
        }),
      );
      assert.equal(response.status, 401);
      const web = HttpServerResponse.toWeb(response);
      assert.deepEqual(await web.json(), { error: "Unauthorized" });
    }
  });

  it("fails closed on invalid ask bodies before calling the model", async () => {
    const { db } = makeSqliteDatabase();
    await assert.rejects(
      () =>
        run(
          handleDiscordAsk({
            db,
            environment,
            request: makeAskRequest({
              body: { userId: "user-1", question: "" },
            }),
          }),
        ),
      /Invalid ask body/,
    );

    await assert.rejects(
      () =>
        run(
          handleDiscordAsk({
            db,
            environment,
            request: makeAskRequest({
              body: { userId: "", question: "ok" },
            }),
          }),
        ),
      /Invalid ask body/,
    );
  });

  it("answers with fitness context via injectable generator and persists the turn", async () => {
    const { db } = makeSqliteDatabase();
    const prompts: Array<{ system: string; prompt: string }> = [];

    const response = await run(
      handleDiscordAsk({
        db,
        environment,
        request: makeAskRequest({
          body: { userId: "user-1", question: "How is recovery?" },
        }),
        generateAnswer: (input) =>
          Effect.sync(() => {
            prompts.push({ system: input.system, prompt: input.prompt });
            return "Recovery looks solid from your recent data.";
          }),
      }),
    );

    assert.equal(response.status, 200);
    const web = HttpServerResponse.toWeb(response);
    const payload = (await web.json()) as { answer: string; conversationId: string };
    assert.equal(payload.answer, "Recovery looks solid from your recent data.");
    assert.ok(typeof payload.conversationId === "string" && payload.conversationId.length > 0);

    assert.equal(prompts.length, 1);
    assert.match(prompts[0]!.prompt, /How is recovery\?/);
    assert.match(prompts[0]!.prompt, /Recovery:/);
    assert.match(prompts[0]!.system, /Discord slash command/);

    const conversationDb = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(db);
    const conversationDatabase = await makeConversationDatabase(conversationDb);
    const conversations = await run(conversationDatabase.getConversations({ userId: "user-1" }));
    assert.equal(
      conversations.some((row) => row.title === "[Discord] /ask"),
      true,
    );
    const messages = await run(
      conversationDatabase.getConversationMessages({
        userId: "user-1",
        conversationId: payload.conversationId,
      }),
    );
    assert.equal(messages.length >= 2, true);
  });

  it("does not answer from stale Hevy data when the provider refresh fails", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0x11);
    const askEnvironment = {
      ...environment,
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };
    const envelope = await Effect.runPromise(
      encryptHevyApiKey({ apiKey: "hevy-test-key", userId: "user-1", keyBytes }),
    );
    await run(
      upsertHevyConnection({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        providerUserId: "hevy-user-1",
        envelope,
        status: "connected",
      }),
    );
    globalThis.fetch = async () => new Response("Hevy unavailable", { status: 503 });
    let generated = false;

    await assert.rejects(
      () =>
        run(
          handleDiscordAsk({
            db,
            environment: askEnvironment,
            request: makeAskRequest({
              body: { userId: "user-1", question: "What should I do today?" },
            }),
            generateAnswer: () =>
              Effect.sync(() => {
                generated = true;
                return "stale answer";
              }),
          }),
        ),
      /status 503/,
    );
    assert.equal(generated, false);
  });
});
