import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import {
  ApplicationCommandInteraction,
  DiscordInteractionType,
  decodeDiscordInteraction,
} from "../../src/discord/interaction-types.ts";

describe("decodeDiscordInteraction command options", () => {
  it("keeps top-level STRING option values (not empty subcommands)", async () => {
    const decoded = await Effect.runPromise(
      decodeDiscordInteraction({
        id: "interaction-1",
        type: DiscordInteractionType.ApplicationCommand,
        token: "token",
        data: {
          id: "command-ask",
          name: "ask",
          options: [{ name: "question", type: 3, value: "How is recovery?" }],
        },
        user: { id: "discord-user-1" },
      }),
    );
    assert.equal(decoded.type, DiscordInteractionType.ApplicationCommand);
    const command = decoded as ApplicationCommandInteraction;
    assert.deepEqual(command.data.options, [
      { name: "question", type: 3, value: "How is recovery?" },
    ]);
  });

  it("still decodes healthfit subcommand trees", async () => {
    const decoded = await Effect.runPromise(
      decodeDiscordInteraction({
        id: "interaction-2",
        type: DiscordInteractionType.ApplicationCommand,
        token: "token",
        data: {
          id: "command-healthfit",
          name: "healthfit",
          options: [
            {
              name: "link",
              type: 1,
              options: [{ name: "code", type: 3, value: "ABCD1234" }],
            },
          ],
        },
        user: { id: "discord-user-1" },
      }),
    );
    assert.equal(decoded.type, DiscordInteractionType.ApplicationCommand);
    const command = decoded as ApplicationCommandInteraction;
    assert.deepEqual(command.data.options, [
      {
        name: "link",
        type: 1,
        options: [{ name: "code", type: 3, value: "ABCD1234" }],
      },
    ]);
  });
});
