import { describe, expect, it } from "vitest";
import { defaultModel } from "./models";
import { useSettings } from "./settings-store";

describe("chat settings persistence", () => {
  it("migrates the previous default model to the current default", async () => {
    const migrate = useSettings.persist.getOptions().migrate;
    if (migrate === undefined) throw new Error("Settings migration is not configured");

    const migrated = await migrate(
      {
        settings: {
          provider: "openai",
          baseUrl: "",
          apiKey: "",
          model: "gpt-5.2-chat-latest",
          systemPrompt: "test",
          coachMode: true,
        },
      },
      0,
    );

    expect(migrated).toMatchObject({ settings: { model: defaultModel.id } });
  });
});
