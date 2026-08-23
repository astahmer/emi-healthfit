import type { ChatUiMessage } from "../../chat/ui-messages.ts";
import type { ThreadMessageValue } from "./thread-message.tsx";

export const chatMessageText = (message: ChatUiMessage | undefined): string =>
  message?.parts.reduce(
    (text, part) => (part.type === "text" ? `${text}${text === "" ? "" : "\n"}${part.text}` : text),
    "",
  ) ?? "";

export const toThreadMessageValue = (message: ChatUiMessage): ThreadMessageValue => ({
  id: message.id,
  role: message.role,
  parts: message.parts,
});

export const hasVisibleChatContent = (message: ChatUiMessage): boolean =>
  message.parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return typeof part.text === "string" && part.text.trim() !== "";
    }
    return true;
  });
