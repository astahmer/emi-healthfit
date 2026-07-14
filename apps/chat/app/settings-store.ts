import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatSettings {
  provider: "openai";
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  coachMode: boolean;
}

const defaultSettings: ChatSettings = {
  provider: "openai",
  baseUrl: "",
  apiKey: "",
  model: "gpt-5.2-chat-latest",
  systemPrompt:
    "You are EmiFit, a helpful fitness assistant. You have access to the user's health and workout data via tools.",
  coachMode: true,
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
