import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProviderMode = "proxy" | "direct";

export interface ChatSettings {
  mode: ProviderMode;
  provider: "openai";
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  coachMode: boolean;
}

const defaultSettings: ChatSettings = {
  mode: "proxy",
  provider: "openai",
  baseUrl: "",
  apiKey: "",
  model: "gpt-4o-mini",
  systemPrompt:
    "You are Emi, a helpful fitness assistant. You have access to the user's health and workout data via tools.",
  coachMode: false,
};

interface SettingsState {
  settings: ChatSettings;
  update: (patch: Partial<ChatSettings>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      update: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
    }),
    { name: "emi-chat-settings" },
  ),
);
