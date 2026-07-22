import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromWeb } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { handleDiscordCommand } from "../src/core/http/discord-command.ts";
import { run, makeSqliteDatabase } from "./sqlite.ts";

const SECRET = "test-discord-command-secret";
const environment = { DISCORD_INTERNAL_ASK_SECRET: SECRET };

const makeCommandRequest = ({ secret, body }: { secret?: string | null; body: unknown }) =>
  fromWeb(
    new Request("https://api.example.com/api/discord/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret === null ? {} : { "x-discord-internal-secret": secret ?? SECRET }),
      },
      body: JSON.stringify(body),
    }),
  );

describe("handleDiscordCommand", () => {
  it("rejects requests without the internal bot secret", async () => {
    const { db } = makeSqliteDatabase();
    const response = await run(
      handleDiscordCommand({
        db,
        environment,
        request: makeCommandRequest({
          secret: null,
          body: { operation: "get-linked-user-id", discordUserId: "discord-user" },
        }),
      }),
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await HttpServerResponse.toWeb(response).json(), { error: "Unauthorized" });
  });

  it("runs last-workout through the API-owned SQLite database", async () => {
    const { db } = makeSqliteDatabase();
    const response = await run(
      handleDiscordCommand({
        db,
        environment,
        request: makeCommandRequest({
          body: { operation: "last-workout", userId: "user-without-workouts" },
        }),
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await HttpServerResponse.toWeb(response).json(), {
      content: "No Hevy workouts found for this account.",
    });
  });

  it("rejects malformed internal command bodies", async () => {
    const { db } = makeSqliteDatabase();
    await assert.rejects(
      () =>
        run(
          handleDiscordCommand({
            db,
            environment,
            request: makeCommandRequest({ body: { operation: "summary", userId: "" } }),
          }),
        ),
      /Invalid Discord command body/,
    );
  });
});
