import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { UIMessage } from "ai";
import type { ChatStreamRequest } from "./ai-sdk.ts";
import { Chat } from "@emi/core/chat";
import { ServerDatabase } from "@emi/core/server/database";
import { decodeMessageParts } from "./http/codecs.ts";
import { validateAttachments } from "./request-codec.ts";
import type { ChatToolDefinition } from "./hooks.ts";

const providerMessageRole = Schema.Literals(["system", "user", "assistant"]);

export const prepareChatHistory = Effect.fn("chatHistory.prepare")(function* ({
  userId,
  chatRequest,
  sessionId,
  isTemporary,
  tools: toolDefinitions = [],
}: {
  userId: string;
  chatRequest: Omit<ChatStreamRequest, "messages"> & { messages: UIMessage[] };
  sessionId: string;
  isTemporary: boolean;
  tools?: ReadonlyArray<ChatToolDefinition>;
}) {
  const database = yield* ServerDatabase.conversations;
  const thread =
    isTemporary || chatRequest.threadId === undefined
      ? null
      : yield* database.getThread({
          userId,
          threadId: chatRequest.threadId,
        });
  if (
    chatRequest.threadId !== undefined &&
    (thread === null || thread.conversation_id !== sessionId || thread.status !== "regular")
  ) {
    return { error: "Thread not found", status: 404 as const };
  }

  const conversationRows = isTemporary
    ? []
    : yield* database.getConversationMessages({
        userId,
        conversationId: sessionId,
      });
  const existingRows =
    thread === null
      ? conversationRows
      : yield* Effect.gen(function* () {
          const branchRows = yield* database.getThreadMessages({
            userId,
            threadId: thread.id,
          });
          const anchor = conversationRows.find((row) => row.id === thread.anchor_message_id);
          const contextRows =
            anchor === undefined
              ? []
              : conversationRows.filter(
                  (row) => row.parent_id === null && row.created_at <= anchor.created_at,
                );
          return [
            ...new Map([...contextRows, ...branchRows].map((row) => [row.id, row])).values(),
          ].toSorted((left, right) => left.created_at.localeCompare(right.created_at));
        });
  const storedMessages = existingRows
    .filter((row) => row.role !== "summary")
    .map((row) => ({
      id: row.id,
      role: Schema.decodeUnknownSync(providerMessageRole)(row.role),
      parts: [...decodeMessageParts(row.parts)],
    }));
  const validatedExistingMessages =
    yield* Chat.messages.validateStoredUIMessagesEffect(storedMessages);
  const existingMessages = [...validatedExistingMessages];
  const requestedMessages = chatRequest.messages;
  const attachmentError = validateAttachments(requestedMessages);
  if (attachmentError !== undefined) return { error: attachmentError, status: 400 as const };

  const replacementMessage =
    chatRequest.replaceMessageId === undefined
      ? undefined
      : existingRows.find((row) => row.id === chatRequest.replaceMessageId);
  if (
    chatRequest.replaceMessageId !== undefined &&
    (isTemporary || replacementMessage === undefined || replacementMessage.role !== "user")
  ) {
    return { error: "Replacement message not found", status: 400 as const };
  }
  const requestedIncomingMessages =
    chatRequest.replaceMessageId === undefined ? requestedMessages : [];
  const duplicateOrphanRetry = Chat.orphans.isDuplicateOrphanRetry({
    existingRows: [...existingRows],
    existingMessages: [...existingMessages],
    incomingMessages: [...requestedIncomingMessages],
  });
  const incomingMessages = duplicateOrphanRetry ? [] : requestedIncomingMessages;
  const toolRecord = Object.fromEntries(
    toolDefinitions.map((definition) => [
      definition.name,
      { description: definition.description, parameters: definition.parameters },
    ]),
  );
  const requestWithHistory: ChatStreamRequest = {
    ...chatRequest,
    messages: Chat.messages
      .getProviderMessages({
        existingRows: [...existingRows],
        existingMessages: [...existingMessages],
        incomingMessages: [...incomingMessages],
        replaceMessageId: chatRequest.replaceMessageId,
      })
      .map(({ id: _id, ...message }) => message),
    sessionId,
    tools: toolRecord,
  };

  let lastIncomingMessageId: string | null =
    chatRequest.replaceMessageId ?? (duplicateOrphanRetry ? existingRows.at(-1)?.id : null) ?? null;
  if (!isTemporary) {
    const branchParentId =
      thread === null ? null : (existingRows.at(-1)?.id ?? thread.anchor_message_id);
    const incomingIds: Array<string> =
      chatRequest.replaceMessageId === undefined
        ? [
            ...(yield* database.saveConversationMessages({
              userId,
              conversationId: sessionId,
              parentId: branchParentId,
              messages: [...incomingMessages],
            })),
          ]
        : [];
    if (chatRequest.replaceMessageId === undefined) {
      lastIncomingMessageId = incomingIds.at(-1) ?? null;
    }
    if (thread !== null) {
      yield* Effect.forEach(
        incomingIds,
        (messageId) =>
          database.addThreadMessage({
            userId,
            threadId: thread.id,
            messageId,
          }),
        { discard: true },
      );
    }
  }

  return {
    thread,
    requestWithHistory,
    incomingMessages,
    lastIncomingMessageId,
    isInitialContext: existingRows.length === 0,
  };
});
