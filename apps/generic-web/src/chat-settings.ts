import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import {
  defaultGenericChatSettings,
  GenericChatSettingsSchema,
  type GenericChatSettings,
} from "@emi/core/chat/settings";

export type ChatSettings = GenericChatSettings;

export const defaultChatSettings = defaultGenericChatSettings;

export const readChatSettings = ({ storageKey }: { storageKey: string }): ChatSettings => {
  const stored = localStorage.getItem(storageKey);
  if (stored === null) return defaultChatSettings;
  try {
    const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(GenericChatSettingsSchema))(
      stored,
    );
    if (Option.isNone(decoded)) return defaultChatSettings;
    return {
      ...defaultChatSettings,
      ...decoded.value,
      model: decoded.value.model || defaultChatSettings.model,
      titleModel: decoded.value.titleModel || defaultChatSettings.titleModel,
    };
  } catch {
    return defaultChatSettings;
  }
};
