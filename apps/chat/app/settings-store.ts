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
    tokenBudget: Schema.Number.pipe(
      Schema.optional,
      Schema.withDecodingDefaultType(Effect.succeed(DEFAULT_TOKEN_BUDGET)),
    ),
  }),
});

type PersistedChatSettings = typeof PersistedChatSettingsSchema.Type;

const decodePersistedChatSettings = Schema.decodeUnknownSync(PersistedChatSettingsSchema);

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      update: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
    }),
    {
      name: "emi-chat-settings",
      version: 3,
      partialize: (state): PersistedChatSettings => ({ settings: state.settings }),
      migrate: (persistedState, version): PersistedChatSettings => {
        try {
          const decoded = decodePersistedChatSettings(persistedState);
          if (version < 1 && decoded.settings.model === "gpt-5.2-chat-latest") {
            return {
              settings: {
                ...decoded.settings,
                model: defaultModel.id,
                tokenBudget:
                  version < 3 && decoded.settings.tokenBudget === LEGACY_DEFAULT_TOKEN_BUDGET
                    ? DEFAULT_TOKEN_BUDGET
                    : decoded.settings.tokenBudget,
              },
            };
          }
          return {
            settings: {
              ...decoded.settings,
              tokenBudget:
                version < 3 && decoded.settings.tokenBudget === LEGACY_DEFAULT_TOKEN_BUDGET
                  ? DEFAULT_TOKEN_BUDGET
                  : decoded.settings.tokenBudget,
            },
          };
        } catch {
          return { settings: defaultSettings };
        }
      },
    },
  ),
);
