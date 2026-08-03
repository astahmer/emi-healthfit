import type { Memory, MemorySummary } from "@emi/core/contract";
import { runApi } from "./api-client";

export class MemoryDomain {
  static provenance(memory: Memory) {
    const matched = memory.source?.match(/^(auto|manual):(.+)$/);
    return {
      source: matched?.[1] ?? memory.source,
      messageId: matched?.[2],
      conversationId: memory.thread_id,
    };
  }

  static async list({
    search,
    limit = 100,
  }: {
    search?: string;
    limit?: number;
  } = {}): Promise<Memory[]> {
    const normalizedSearch = search?.trim();
    const data = await runApi((client) =>
      client.memories.list({
        query: {
          search: normalizedSearch === "" ? undefined : normalizedSearch,
          limit,
        },
      }),
    );
    return [...data.memories];
  }

  static async summary(): Promise<MemorySummary | undefined> {
    const data = await runApi((client) => client.memories.summary());
    return data.summary ?? undefined;
  }

  static async updateSummary({ content }: { content: string }): Promise<MemorySummary> {
    const data = await runApi((client) => client.memories.updateSummary({ payload: { content } }));
    return data.summary;
  }

  static async create({
    content,
    source,
    threadId,
    messageId,
  }: {
    content: string;
    source?: string;
    threadId?: string;
    messageId?: string;
  }): Promise<string> {
    const data = await runApi((client) =>
      client.memories.create({
        payload: {
          content,
          ...(source === undefined ? {} : { source }),
          ...(threadId === undefined ? {} : { threadId }),
          ...(messageId === undefined ? {} : { messageId }),
        },
      }),
    );
    return data.id;
  }

  static async extract({
    text,
    threadId,
    messageId,
    source,
    config,
  }: {
    text: string;
    threadId?: string;
    messageId?: string;
    source?: "auto" | "manual";
    config: { apiKey: string; baseUrl?: string; model: string };
  }): Promise<string[]> {
    const data = await runApi((client) =>
      client.memoryExtraction.extract({
        payload: { text, threadId, messageId, source, config },
      }),
    );
    return [...data.ids];
  }

  static async remove({ id }: { id: string }): Promise<void> {
    await runApi((client) => client.memories.remove({ params: { id } }));
  }

  static async removeByMessage({ messageId }: { messageId: string }): Promise<void> {
    await runApi((client) => client.memories.removeByMessage({ params: { messageId } }));
  }
}
