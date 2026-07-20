import type { Memory } from "@emi/core-contract";
import { runApi } from "./api-client";

export type { Memory } from "@emi/core-contract";

export const memoryProvenance = (memory: Memory) => {
  const matched = memory.source?.match(/^(auto|manual):(.+)$/);
  return {
    source: matched?.[1] ?? memory.source,
    messageId: matched?.[2],
    conversationId: memory.thread_id,
  };
};

export const fetchMemories = async ({
  search,
  limit = 100,
}: {
  search?: string;
  limit?: number;
} = {}): Promise<Memory[]> => {
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
};

export const createMemory = async (
  content: string,
  source?: string,
  threadId?: string,
  messageId?: string,
): Promise<string> => {
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
};

export const extractMemories = async ({
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
}): Promise<string[]> => {
  const data = await runApi((client) =>
    client.memoryExtraction.extract({
      payload: { text, threadId, messageId, source, config },
    }),
  );
  return [...data.ids];
};

export const deleteMemory = async (id: string): Promise<void> => {
  await runApi((client) => client.memories.remove({ params: { id } }));
};

export const deleteMemoriesByMessage = async (messageId: string): Promise<void> => {
  await runApi((client) => client.memories.removeByMessage({ params: { messageId } }));
};
