import type { ConversationMessageNode, ConversationThreadView } from "./types.ts";

export const getRootMessages = <TMessage extends ConversationMessageNode>(
  messages: readonly TMessage[],
): TMessage[] => messages.filter((message) => message.parentId === null);

export const getChildMessages = <TMessage extends ConversationMessageNode>(
  messages: readonly TMessage[],
  parentId: string,
): TMessage[] =>
  messages
    .filter((message) => message.parentId === parentId)
    .toSorted((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

export const getMessageAncestors = <TMessage extends ConversationMessageNode>(
  messages: readonly TMessage[],
  messageId: string,
): TMessage[] => {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const ancestors: TMessage[] = [];
  let current = byId.get(messageId);

  while (current !== undefined && current.parentId !== null) {
    const parent = byId.get(current.parentId);
    if (parent === undefined) break;
    ancestors.unshift(parent);
    current = parent;
  }

  return ancestors;
};

export const getMessagePath = <TMessage extends ConversationMessageNode>(
  messages: readonly TMessage[],
  messageId: string,
): TMessage[] => {
  const target = messages.find((message) => message.id === messageId);
  if (target === undefined) return [];
  return [...getMessageAncestors(messages, messageId), target];
};

export const getThreadMessages = <
  TMessage extends ConversationMessageNode,
  TThread extends ConversationThreadView,
>(
  messages: readonly TMessage[],
  thread: TThread,
): TMessage[] => {
  const included = new Set(thread.messageIds);
  return messages
    .filter((message) => included.has(message.id))
    .toSorted((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

export const getConversationViewMessages = <
  TMessage extends ConversationMessageNode,
  TThread extends ConversationThreadView,
>({
  messages,
  thread,
}: {
  messages: readonly TMessage[];
  thread: TThread | undefined;
}): TMessage[] => {
  if (thread === undefined) return getRootMessages(messages);

  const anchor = messages.find((message) => message.id === thread.anchorMessageId);
  const included = new Set(thread.messageIds);
  return messages.filter(
    (message) =>
      included.has(message.id) ||
      (message.parentId === null && anchor !== undefined && message.createdAt <= anchor.createdAt),
  );
};

export const getMessageText = <TMessage extends ConversationMessageNode>(
  message: TMessage,
): string =>
  message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");

export const searchMessages = <TMessage extends ConversationMessageNode>(
  messages: readonly TMessage[],
  query: string,
): TMessage[] => {
  const term = query.trim().toLowerCase();
  if (term === "") return [];
  return messages.filter((message) => getMessageText(message).toLowerCase().includes(term));
};
