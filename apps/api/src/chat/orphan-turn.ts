export const getOrphanUserMessageId = (
  messages: Array<{ id: string; role: string }>,
): string | null => {
  const lastMessage = messages.at(-1);
  return lastMessage?.role === "user" ? lastMessage.id : null;
};
