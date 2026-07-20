export const getOrphanUserMessageId = (
  messages: Array<{ id: string; role: string }>,
): string | null => {
  const lastMessage = messages.at(-1);
  return lastMessage?.role === "user" ? lastMessage.id : null;
};

export const getProviderMessages = <Message extends { role: string }>({
  existingRows,
  existingMessages,
  incomingMessages,
  replaceMessageId,
}: {
  existingRows: Array<{ id: string; role: string }>;
  existingMessages: Message[];
  incomingMessages: Message[];
  replaceMessageId: string | undefined;
}): Message[] => {
  const hasNewMessage = replaceMessageId === undefined && incomingMessages.length > 0;
  const hasOrphanedTurn = getOrphanUserMessageId(existingRows) !== null;
  const history =
    hasNewMessage && hasOrphanedTurn ? existingMessages.slice(0, -1) : existingMessages;
  return [...history, ...incomingMessages];
};
