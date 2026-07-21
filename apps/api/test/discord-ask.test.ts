import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromWeb } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { ConversationDatabaseSchema } from "@emi/core/server";
import { handleDiscordAsk } from "../src/core/http/discord-ask.ts";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

const SECRET = "test-discord-ask-secret";
const environment = {
  DISCORD_INTERNAL_ASK_SECRET: SECRET,
  OPENAI_API_KEY: "test-openai-key",
};

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
    const conversationDb = narrowQueryDatabaseClient<ConversationDatabaseSchema>(db);

    for (const secret of [null, "wrong-discord-ask-s", "x".repeat(SECRET.length)]) {
      const response = await run(
        handleDiscordAsk({
          db: conversationDb,
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
    const conversationDb = narrowQueryDatabaseClient<ConversationDatabaseSchema>(db);

    await assert.rejects(
      () =>
        run(
          handleDiscordAsk({
            db: conversationDb,
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
            db: conversationDb,
            environment,
            request: makeAskRequest({
              body: { userId: "", question: "ok" },
            }),
          }),
        ),
      /Invalid ask body/,
    );
  });
});
