import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ChatStreamRequest } from "../chat/ai-sdk.ts";
import { getProviderMessages } from "../chat/orphan-turn.ts";
import { validateStoredUIMessages } from "../chat/ui-messages.ts";
import {
  addThreadMessage,
  getConversationMessages,
  getThread,
  getThreadMessages,
  saveConversationMessages,
} from "../db/conversations.ts";
import type { QueryDatabaseClient } from "../../platform/db/client.ts";
import { decodeMessageParts } from "../http/codecs.ts";
import { validateAttachments } from "./chat-request-codec.ts";
import type { ChatToolDefinition } from "./chat-hooks.ts";

const providerMessageRole = Schema.Literals(["system", "user", "assistant"]);

export const prepareChatHistory = Effect.fn("chatHistory.prepare")(function* ({
  db,
  userId,
  chatRequest,
  sessionId,
  isTemporary,
  tools: toolDefinitions = [],
}: {
  db: QueryDatabaseClient;
  userId: string;
  chatRequest: ChatStreamRequest;
  sessionId: string;
  isTemporary: boolean;
  tools?: ReadonlyArray<ChatToolDefinition>;
}) {
  const thread =
    isTemporary || chatRequest.threadId === undefined
      ? null
      : yield* getThread(db, userId, chatRequest.threadId);
  if (
    chatRequest.threadId !== undefined &&
    (thread === null || thread.conversation_id !== sessionId || thread.status !== "regular")
  ) {
    return { error: "Thread not found", status: 404 as const };
  }

  const conversationRows = isTemporary ? [] : yield* getConversationMessages(db, userId, sessionId);
  const existingRows =
    thread === null
      ? conversationRows
      : yield* Effect.gen(function* () {
          const branchRows = yield* getThreadMessages(db, userId, thread.id);
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
  const validatedExistingMessages = yield* Effect.promise(() =>
    validateStoredUIMessages(storedMessages),
  );
  const existingMessages = validatedExistingMessages.map((message) => ({
    role: message.role,
    parts: message.parts,
  }));
  const requestedMessages = chatRequest.messages.map((message) => ({
    role: message.role,
    parts: message.parts,
  }));
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
  const incomingMessages = chatRequest.replaceMessageId === undefined ? requestedMessages : [];
  const toolRecord = Object.fromEntries(
    toolDefinitions.map((definition) => [
      definition.name,
      { description: definition.description, parameters: definition.parameters },
    ]),
  );
  const requestWithHistory: ChatStreamRequest = {
    ...chatRequest,
    messages: getProviderMessages({
      existingRows,
      existingMessages,
      incomingMessages,
      replaceMessageId: chatRequest.replaceMessageId,
    }),
    sessionId,
    tools: toolRecord,
  };

  let lastIncomingMessageId: string | null = chatRequest.replaceMessageId ?? null;
  if (!isTemporary) {
    const branchParentId =
      thread === null ? null : (existingRows.at(-1)?.id ?? thread.anchor_message_id);
    const incomingIds =
      chatRequest.replaceMessageId === undefined
        ? yield* saveConversationMessages(db, userId, sessionId, branchParentId, incomingMessages)
        : [];
    if (chatRequest.replaceMessageId === undefined) {
      lastIncomingMessageId = incomingIds.at(-1) ?? null;
    }
    if (thread !== null) {
      yield* Effect.forEach(
        incomingIds,
        (messageId) => addThreadMessage(db, userId, thread.id, messageId),
        { discard: true },
      );
    }
  }

  return { thread, requestWithHistory, incomingMessages, lastIncomingMessageId };
});
