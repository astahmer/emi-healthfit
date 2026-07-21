import type { ConversationMessageNode } from "./types.ts";

const messageRole = (role: string): string => {
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  if (role === "summary") return "Summary";
  return "User";
};

const messageText = <TMessage extends ConversationMessageNode>(message: TMessage): string =>
  message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");

export const conversationMarkdown = <TMessage extends ConversationMessageNode>(
  messages: readonly TMessage[],
): string =>
  messages
    .map((message) => `## ${messageRole(message.role)}\n\n${messageText(message)}`)
    .join("\n\n---\n\n");
