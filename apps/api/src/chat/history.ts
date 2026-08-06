import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { UIMessage } from "ai";
import type { AiSdkChatStreamRequest as ChatStreamRequest } from "@emi/core/adapters/ai-sdk";
import { Chat } from "@emi/core/chat";
import { ServerDatabase } from "@emi/core/server/database";
import {
  externalizeMessageAttachmentsEffect,
  resolveExternalizedAttachmentsEffect,
  type ReadWriteBucketClient,
} from "./attachment-storage.ts";
import { maxStoredMessagePartsBytes, messagePartsJsonBytes } from "./attachment-policy.ts";
import { decodeMessageParts } from "./http/codecs.ts";
import { validateAttachments } from "./request-codec.ts";
import type { ChatToolDefinition } from "./hooks.ts";

const providerMessageRole = Schema.Literals(["system", "user", "assistant"]);

const messageText = (row: { parts: string }): string =>
  decodeMessageParts(row.parts)
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");

const estimateTextTokens = (text: string): number => Math.ceil(text.length / 4);

const estimateIncomingTokens = (messages: ReadonlyArray<UIMessage>): number =>
  messages.reduce(
    (total, message) =>
      total +
      message.parts.reduce(
        (messageTotal, part) =>
          part.type === "text" ? messageTotal + estimateTextTokens(part.text) : messageTotal,
        0,
      ),
    0,
  );

const latestSummaryIndex = (rows: ReadonlyArray<ServerDatabase.Message>): number =>
  rows.findLastIndex((row) => row.role === "summary");

const rowIndexById = (rows: ReadonlyArray<ServerDatabase.Message>, rowId: string): number =>
  rows.findIndex((row) => row.id === rowId);

const storedUsageTokens = (rows: ReadonlyArray<ServerDatabase.Message>): number =>
  rows.reduce(
    (total, row) => total + (row.total_tokens ?? estimateTextTokens(messageText(row))),
    0,
  );

const autoCompactOverBudgetEffect = Effect.fn("chatHistory.autoCompact")(function* ({
  userId,
  conversationId,
  rows,
  budget,
  incomingMessages,
  configuration,
}: {
  userId: string;
  conversationId: string;
  rows: ReadonlyArray<ServerDatabase.Message>;
  budget: number;
  incomingMessages: ReadonlyArray<UIMessage>;
  configuration: ChatStreamRequest["config"];
}) {
  const database = yield* ServerDatabase.conversations;
  const markerIndex = latestSummaryIndex(rows);
  const activeRows =
    markerIndex < 0
      ? rows.filter((row) => row.role !== "summary")
      : rows.slice(markerIndex + 1).filter((row) => row.role !== "summary");
  if (storedUsageTokens(activeRows) + estimateIncomingTokens(incomingMessages) <= budget) {
    return { compacted: false, rows };
  }

  const compactTarget = rows.filter((row) => row.role !== "summary");
  const compactMessages = compactTarget
    .map((row) => ({ role: row.role, text: messageText(row) }))
    .filter((message) => message.text.trim() !== "");
  if (compactMessages.length === 0) {
    return { compacted: false, rows };
  }

  const summary = yield* Chat.generation
    .generateConversationSummaryEffect({
      configuration,
      messages: compactMessages,
    })
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("chat.auto-compact.summary-failed").pipe(
          Effect.annotateLogs({ conversationId, error: String(error) }),
          Effect.as(undefined),
        ),
      ),
    );
  if (summary === undefined) {
    return { compacted: false, rows };
  }

  const summaryText = `Use this compacted summary of the previous conversation as context:\n\n${summary}`;
  yield* database.saveConversationMessages({
    userId,
    conversationId,
    parentId: compactTarget.at(-1)?.id ?? null,
    messages: [{ role: "summary", parts: [{ type: "text", text: summaryText }] }],
  });
  const refreshedRows = yield* database.getConversationMessages({ userId, conversationId });
  return { compacted: true, rows: refreshedRows };
});

export const prepareChatHistory = Effect.fn("chatHistory.prepare")(function* ({
  userId,
  chatRequest,
  sessionId,
  isTemporary,
  bucket,
  tools: toolDefinitions = [],
}: {
  userId: string;
  chatRequest: Omit<ChatStreamRequest, "messages"> & { messages: UIMessage[] };
  sessionId: string;
  isTemporary: boolean;
  bucket: ReadWriteBucketClient;
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

  let conversationRows = isTemporary
    ? []
    : yield* database.getConversationMessages({
        userId,
        conversationId: sessionId,
      });
  const requestedMessages = chatRequest.messages;
  const attachmentError = validateAttachments(requestedMessages);
  if (attachmentError !== undefined) return { error: attachmentError, status: 400 as const };
  let compacted = false;
  if (
    !isTemporary &&
    chatRequest.replaceMessageId === undefined &&
    chatRequest.tokenBudget !== undefined &&
    chatRequest.tokenBudget > 0
  ) {
    const autoCompact = yield* autoCompactOverBudgetEffect({
      userId,
      conversationId: sessionId,
      rows: conversationRows,
      budget: chatRequest.tokenBudget,
      incomingMessages: requestedMessages,
      configuration: chatRequest.config,
    });
    compacted = autoCompact.compacted;
    conversationRows = autoCompact.rows;
  }
  const existingRows =
    thread === null
      ? conversationRows
      : yield* Effect.gen(function* () {
          const branchRows = yield* database.getThreadMessages({
            userId,
            threadId: thread.id,
          });
          const anchor = conversationRows.find((row) => row.id === thread.anchor_message_id);
          const markerIndex = latestSummaryIndex(conversationRows);
          const contextRows =
            anchor === undefined
              ? []
              : conversationRows.filter(
                  (row) =>
                    row.parent_id === null &&
                    row.created_at <= anchor.created_at &&
                    (markerIndex < 0 || rowIndexById(conversationRows, row.id) > markerIndex),
                );
          const mergedRows = [
            ...new Map([...contextRows, ...branchRows].map((row) => [row.id, row])).values(),
          ]
            .filter(
              (row) =>
                row.parent_id !== null ||
                markerIndex < 0 ||
                rowIndexById(conversationRows, row.id) > markerIndex,
            )
            .toSorted((left, right) => left.created_at.localeCompare(right.created_at));
          return [...(markerIndex < 0 ? [] : [conversationRows[markerIndex]]), ...mergedRows];
        });
  const summaryMarker = existingRows.findLast((row) => row.role === "summary");
  const preMarkerCount =
    summaryMarker === undefined ? 0 : rowIndexById(existingRows, summaryMarker.id);
  const storedMessages = existingRows.flatMap((row) => {
    if (row.role === "summary") {
      return row.id === summaryMarker?.id
        ? [
            {
              id: row.id,
              role: "system" as const,
              parts: Chat.messages.fromProtocolMessage({
                id: row.id,
                role: "system",
                parts: [...decodeMessageParts(row.parts)],
              }).parts,
            },
          ]
        : [];
    }
    if (
      thread === null &&
      summaryMarker !== undefined &&
      rowIndexById(existingRows, row.id) < preMarkerCount
    ) {
      return [];
    }
    const role = Schema.decodeUnknownSync(providerMessageRole)(row.role);
    return [
      {
        id: row.id,
        role,
        parts: Chat.messages.fromProtocolMessage({
          id: row.id,
          role,
          parts: [...decodeMessageParts(row.parts)],
        }).parts,
      },
    ];
  });
  const validatedExistingMessages =
    yield* Chat.messages.validateStoredUIMessagesEffect(storedMessages);
  const existingMessages = yield* resolveExternalizedAttachmentsEffect({
    userId,
    messages: validatedExistingMessages,
    bucket,
  });

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
    const persistedIncomingMessages = yield* externalizeMessageAttachmentsEffect({
      userId,
      messages: incomingMessages,
      bucket,
    });
    if (
      persistedIncomingMessages.some(
        (message) => messagePartsJsonBytes(message.parts) > maxStoredMessagePartsBytes,
      )
    ) {
      return { error: "Message is too large to store", status: 400 as const };
    }
    const incomingIds: Array<string> =
      chatRequest.replaceMessageId === undefined
        ? [
            ...(yield* database.saveConversationMessages({
              userId,
              conversationId: sessionId,
              parentId: branchParentId,
              messages: [...persistedIncomingMessages],
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
    compacted,
  };
});
