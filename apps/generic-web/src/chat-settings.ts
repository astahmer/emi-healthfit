import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const SettingsSchema = Schema.Struct({
  apiKey: Schema.String,
  baseUrl: Schema.String,
  model: Schema.String,
});

export type ChatSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export const defaultChatSettings: ChatSettings = {
  apiKey: "",
  baseUrl: "",
  model: "gpt-4o-mini",
};

export const readChatSettings = ({ storageKey }: { storageKey: string }): ChatSettings => {
  const stored = localStorage.getItem(storageKey);
  if (stored === null) return defaultChatSettings;
  try {
    const parsed: unknown = JSON.parse(stored);
    const decoded = Schema.decodeUnknownOption(SettingsSchema)(parsed);
    if (Option.isNone(decoded)) return defaultChatSettings;
    return decoded.value.model === ""
      ? { ...decoded.value, model: defaultChatSettings.model }
      : decoded.value;
  } catch {
    return defaultChatSettings;
  }
};
