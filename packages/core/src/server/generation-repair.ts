import * as Effect from "effect/Effect";
import type { GenerationDatabaseShape } from "./db/generations.ts";
import type { ConversationDatabaseShape } from "./db/conversations.ts";
import type { DatabaseQueryError } from "./db/query-database.ts";
import { ChatMessageParts } from "../chat/message-parts.ts";

const repairWindowMilliseconds = 5 * 60 * 1_000;
const unfinishedWindowMilliseconds = 15 * 60 * 1_000;

const contentChunkTypes = new Set([
  "text-start",
  "text-delta",
  "tool-input-available",
  "tool-input-start",
  "tool-input-error",
  "tool-output-available",
  "tool-output-error",
]);

export class GenerationRepair {
  static readonly repairOrphanedMessages: (input: {
    readonly generationDatabase: GenerationDatabaseShape;
    readonly conversationDatabase: ConversationDatabaseShape;
    readonly userId: string;
    readonly limit?: number;
  }) => Effect.Effect<number, DatabaseQueryError> = Effect.fn("chatGeneration.repairOrphaned")(
    function* ({ generationDatabase, conversationDatabase, userId, limit = 50 }) {
      const candidates = yield* generationDatabase.getTerminalGenerationsWithoutFinishChunk({
        userId,
        limit,
      });
      let repairedCount = 0;
      for (const generation of candidates) {
        const alreadyRepaired = yield* generationDatabase.hasChatEvent({
          userId,
          generationId: generation.id,
          type: "generation.repaired",
        });
        if (alreadyRepaired) continue;

        const storedChunks = yield* generationDatabase
          .getGenerationChunks({
            userId,
            generationId: generation.id,
            afterSequence: 0,
          })
          .pipe(Effect.catch(() => Effect.succeed([])));
        if (storedChunks.length === 0) continue;
        if (!storedChunks.some(({ chunk }) => contentChunkTypes.has(chunk.type))) continue;

        const messages = yield* conversationDatabase.getConversationMessages({
          userId,
          conversationId: generation.conversation_id,
        });
        const startedAt = Date.parse(generation.started_at);
        const windowStart = new Date(startedAt - repairWindowMilliseconds).toISOString();
        const windowEnd = new Date(
          generation.finished_at !== null
            ? Date.parse(generation.finished_at)
            : startedAt + unfinishedWindowMilliseconds,
        ).toISOString();
        const hasReplyInWindow = messages.some(
          (message) =>
            message.role === "assistant" &&
            message.created_at >= windowStart &&
            message.created_at <= windowEnd,
        );
        if (hasReplyInWindow) continue;

        const parts = ChatMessageParts.buildAssistantPartsFromUiChunks(
          storedChunks.map(({ chunk }) => chunk),
        );
        if (parts.length === 0) continue;

        const previousMessage =
          messages
            .filter((message) => message.created_at <= generation.started_at)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
        const messageIds = yield* conversationDatabase.saveConversationMessages({
          userId,
          conversationId: generation.conversation_id,
          parentId: previousMessage?.id ?? null,
          messages: [
            {
              role: "assistant",
              parts,
              model: generation.model ?? undefined,
            },
          ],
        });
        if (messageIds.length === 0) continue;

        yield* generationDatabase.recordChatEvent({
          userId,
          conversationId: generation.conversation_id,
          generationId: generation.id,
          requestId: generation.request_id,
          traceId: generation.trace_id,
          type: "generation.repaired",
          payload: { messageId: messageIds[0] },
        });
        repairedCount += 1;
      }
      return repairedCount;
    },
  );
}
