import { describe, expect, it } from "vitest";
import { defaultModel } from "./models";
import { DEFAULT_TOKEN_BUDGET, useSettings } from "./settings-store";

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

    expect(migrated).toMatchObject({
      settings: { model: defaultModel.id, tokenBudget: DEFAULT_TOKEN_BUDGET },
    });
  });

  it("falls back to the default token budget for stored settings without one", async () => {
    const migrate = useSettings.persist.getOptions().migrate;
    if (migrate === undefined) throw new Error("Settings migration is not configured");

    const migrated = await migrate(
      {
        settings: {
          provider: "openai",
          baseUrl: "",
          apiKey: "",
          model: "gpt-4o-mini",
          systemPrompt: "test",
          coachMode: true,
        },
      },
      1,
    );

    expect(migrated).toMatchObject({ settings: { tokenBudget: DEFAULT_TOKEN_BUDGET } });
  });

  it("persists a custom default token budget", () => {
    useSettings.getState().update({ tokenBudget: 250_000 });
    const persisted = JSON.parse(localStorage.getItem("emi-chat-settings") ?? "{}");

    expect(persisted.state.settings.tokenBudget).toBe(250_000);
  });
});
