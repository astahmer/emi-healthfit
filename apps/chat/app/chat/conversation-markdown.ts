import type { MessageNode } from "./conversation-machine";

const messageRole = (role: MessageNode["role"]): string => {
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  if (role === "summary") return "Summary";
  return "User";
};

const messageText = (message: MessageNode): string =>
  message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");

export const conversationMarkdown = (messages: MessageNode[]): string =>
  messages
    .map((message) => `## ${messageRole(message.role)}\n\n${messageText(message)}`)
    .join("\n\n---\n\n");
