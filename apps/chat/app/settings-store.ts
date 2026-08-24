import { Effect } from "effect";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultModel } from "./models";

export const DEFAULT_TOKEN_BUDGET = 10_000_000;
const LEGACY_DEFAULT_TOKEN_BUDGET = 100_000;

interface ChatSettings {
  provider: "openai";
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  coachMode: boolean;
  showTokenUsage: boolean;
  tokenBudgetEnabled: boolean;
  tokenBudget: number;
}

const defaultSettings: ChatSettings = {
  provider: "openai",
  baseUrl: "",
  apiKey: "",
  model: defaultModel.id,
  systemPrompt:
    "You are EmiFit, a helpful fitness assistant. You have access to the user's health and workout data via tools.",
  coachMode: true,
  showTokenUsage: false,
  tokenBudgetEnabled: false,
  tokenBudget: DEFAULT_TOKEN_BUDGET,
};

interface SettingsState {
  settings: ChatSettings;
  update: (patch: Partial<ChatSettings>) => void;
}

const PersistedChatSettingsSchema = Schema.Struct({
  settings: Schema.Struct({
    provider: Schema.Literal("openai"),
    baseUrl: Schema.String,
    apiKey: Schema.String,
    model: Schema.String,
    systemPrompt: Schema.String,
    coachMode: Schema.Boolean,
    showTokenUsage: Schema.optional(Schema.Boolean),
    tokenBudgetEnabled: Schema.optional(Schema.Boolean),
    tokenBudget: Schema.Number.pipe(
      Schema.optional,
      Schema.withDecodingDefaultType(Effect.succeed(DEFAULT_TOKEN_BUDGET)),
    ),
  }),
});

type PersistedChatSettings = typeof PersistedChatSettingsSchema.Type;

const decodePersistedChatSettings = Schema.decodeUnknownSync(PersistedChatSettingsSchema);

declare global {
  interface Window {
    __emiSettings?: SettingsState;
  }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      update: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
    }),
    {
      name: "emi-chat-settings",
      version: 4,
      merge: (persisted, current): SettingsState => {
        const persistedSettings =
          typeof persisted === "object" && persisted !== null
            ? ((persisted as { settings?: Partial<ChatSettings> }).settings ?? {})
            : {};
        const mergedSettings = { ...current.settings, ...persistedSettings };
        // New transparency/budget keys must always exist even when an
        // older payload with a matching store version skips migration.
        if (mergedSettings.showTokenUsage === undefined)
          mergedSettings.showTokenUsage = current.settings.showTokenUsage;
        if (mergedSettings.tokenBudgetEnabled === undefined)
          mergedSettings.tokenBudgetEnabled = current.settings.tokenBudgetEnabled;
        if (mergedSettings.tokenBudget === undefined)
          mergedSettings.tokenBudget = current.settings.tokenBudget;
        return { ...current, settings: mergedSettings };
      },
      partialize: (state): PersistedChatSettings => ({ settings: state.settings }),
      migrate: (persistedState, version): PersistedChatSettings => {
        try {
          const decoded = decodePersistedChatSettings(persistedState);
          const withDefaults = {
            ...defaultSettings,
            ...decoded.settings,
            showTokenUsage: decoded.settings.showTokenUsage ?? false,
            tokenBudgetEnabled: decoded.settings.tokenBudgetEnabled ?? false,
          };
          if (version < 1 && withDefaults.model === "gpt-5.2-chat-latest") {
            return {
              settings: {
                ...withDefaults,
                model: defaultModel.id,
                tokenBudget:
                  version < 3 && withDefaults.tokenBudget === LEGACY_DEFAULT_TOKEN_BUDGET
                    ? DEFAULT_TOKEN_BUDGET
                    : withDefaults.tokenBudget,
              },
            };
          }
          return {
            settings: {
              ...withDefaults,
              tokenBudget:
                version < 3 &&
                decoded.settings.tokenBudget !== undefined &&
                decoded.settings.tokenBudget === LEGACY_DEFAULT_TOKEN_BUDGET
                  ? DEFAULT_TOKEN_BUDGET
                  : (decoded.settings.tokenBudget ?? DEFAULT_TOKEN_BUDGET),
            },
          };
        } catch {
          return { settings: defaultSettings };
        }
      },
    },
  ),
);
