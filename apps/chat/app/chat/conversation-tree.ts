import type { MessageNode, ThreadView } from "./conversation-machine";

export const getRootMessages = (messages: MessageNode[]): MessageNode[] =>
  messages.filter((message) => message.parentId === null);

export const getChildMessages = (messages: MessageNode[], parentId: string): MessageNode[] =>
  messages
    .filter((message) => message.parentId === parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

export const getMessageAncestors = (messages: MessageNode[], messageId: string): MessageNode[] => {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const ancestors: MessageNode[] = [];
  let current = byId.get(messageId);

  while (current !== undefined && current.parentId !== null) {
    const parent = byId.get(current.parentId);
    if (parent === undefined) break;
    ancestors.unshift(parent);
    current = parent;
  }

  return ancestors;
};

export const getMessagePath = (messages: MessageNode[], messageId: string): MessageNode[] => {
  const target = messages.find((message) => message.id === messageId);
  if (target === undefined) return [];
  return [...getMessageAncestors(messages, messageId), target];
};

export const getThreadMessages = (messages: MessageNode[], thread: ThreadView): MessageNode[] => {
  const included = new Set(thread.messageIds);
  return messages
    .filter((message) => included.has(message.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

export const getConversationViewMessages = ({
  messages,
  thread,
}: {
  messages: MessageNode[];
  thread: ThreadView | undefined;
}): MessageNode[] => {
  if (thread === undefined) return getRootMessages(messages);

  const anchor = messages.find((message) => message.id === thread.anchorMessageId);
  const included = new Set(thread.messageIds);
  return messages.filter(
    (message) =>
      included.has(message.id) ||
      (message.parentId === null && anchor !== undefined && message.createdAt <= anchor.createdAt),
  );
};

const getMessageText = (message: MessageNode): string =>
  message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");

export const searchMessages = (messages: MessageNode[], query: string): MessageNode[] => {
  const term = query.trim().toLowerCase();
  if (term === "") return [];
  return messages.filter((message) => getMessageText(message).toLowerCase().includes(term));
};
