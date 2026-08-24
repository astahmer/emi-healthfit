import { beforeEach, describe, expect, it, vi } from "vitest";

const seedPersistedSettings = (payload: unknown): void => {
  window.localStorage.setItem("emi-chat-settings", JSON.stringify(payload));
};

type PersistedSettings = {
  state: { settings: {
    provider: "openai";
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    coachMode: boolean;
    showTokenUsage?: boolean;
    tokenBudgetEnabled?: boolean;
      tokenBudget?: number;
    };
  };
  version: number;
};

const loadStore = async (): Promise<typeof import("./settings-store")> => {
  vi.resetModules();
  return import("./settings-store");
};

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

describe("chat settings store migration", () => {
  it("keeps the new transparency flags off by default", async () => {
    seedPersistedSettings({
      state: {
        settings: {
          provider: "openai",
          baseUrl: "",
          apiKey: "sk-test",
          model: "gpt-4o-mini",
          systemPrompt: "",
          coachMode: false,
        },
      },
      version: 4,
    } satisfies PersistedSettings);

    const { useSettings } = await loadStore();
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().settings.showTokenUsage).toBe(false);
    expect(useSettings.getState().settings.tokenBudgetEnabled).toBe(false);
  });

  it("migrates a version-3 payload and preserves an explicit budget", async () => {
    seedPersistedSettings({
      state: {
        settings: {
          provider: "openai",
          baseUrl: "",
          apiKey: "sk-test",
          model: "gpt-4o-mini",
          systemPrompt: "",
          coachMode: true,
          tokenBudget: 250_000,
        },
      },
      version: 3,
    } satisfies PersistedSettings);

    const { useSettings } = await loadStore();
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().settings.showTokenUsage).toBe(false);
    expect(useSettings.getState().settings.tokenBudgetEnabled).toBe(false);
    expect(useSettings.getState().settings.tokenBudget).toBe(250_000);
  });

  it("persists toggles flipped by the user", async () => {
    const { useSettings } = await loadStore();
    await useSettings.persist.rehydrate();
    useSettings.getState().update({ showTokenUsage: true, tokenBudgetEnabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await vi.waitFor(() => {
      const raw = JSON.parse(
        window.localStorage.getItem("emi-chat-settings") ?? "{}",
      ) as PersistedSettings;
      expect(raw.state?.settings?.showTokenUsage).toBe(true);
      expect(raw.state?.settings?.tokenBudgetEnabled).toBe(true);
    });
  });
});
