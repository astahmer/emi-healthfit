import type { Memory } from "@emi/api-contract";
import { runApi } from "./api-client";

export type { Memory } from "@emi/api-contract";

export const fetchMemories = async (search?: string, limit = 100): Promise<Memory[]> => {
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
): Promise<string> => {
  const data = await runApi((client) =>
    client.memories.create({ payload: { content, source, threadId } }),
  );
  return data.id;
};

export const extractMemories = async ({
  text,
  threadId,
  config,
}: {
  text: string;
  threadId?: string;
  config: { apiKey: string; baseUrl?: string; model: string };
}): Promise<string[]> => {
  const data = await runApi((client) =>
    client.memoryExtraction.extract({ payload: { text, threadId, config } }),
  );
  return [...data.ids];
};

export const deleteMemory = async (id: string): Promise<void> => {
  await runApi((client) => client.memories.remove({ params: { id } }));
};
