import { beforeEach, expect, it, vi } from "vitest";
import { useSettings } from "./settings-store";

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

it("v0 seed keeps enabled budget", async () => {
  window.localStorage.setItem(
    "emi-chat-settings",
    JSON.stringify({
      state: {
        settings: {
          provider: "openai",
          baseUrl: "",
          apiKey: "sk-test",
          model: "gpt-4o-mini",
          systemPrompt: "You are a test assistant.",
          coachMode: false,
          tokenBudgetEnabled: true,
          tokenBudget: 10,
        },
      },
      version: 0,
    }),
  );
  await useSettings.persist.rehydrate();
  console.log("STATE:", JSON.stringify(useSettings.getState().settings));
  expect(useSettings.getState().settings.tokenBudgetEnabled).toBe(true);
});
