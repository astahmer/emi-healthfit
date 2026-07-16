import { safeValidateUIMessages, type UIMessage } from "ai";

export const validateStoredUIMessages = async (messages: unknown[]): Promise<UIMessage[]> => {
  if (messages.length === 0) return [];

  const validatedMessages = await safeValidateUIMessages<UIMessage>({ messages });
  if (!validatedMessages.success) throw validatedMessages.error;
  return validatedMessages.data;
};
