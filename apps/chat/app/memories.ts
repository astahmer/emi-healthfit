import type { Memory } from "@emi/api-contract";
import { runApi } from "./api-client";

export type { Memory } from "@emi/api-contract";

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

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

export const extractMemories = async (text: string, threadId?: string): Promise<string[]> => {
  const res = await fetch(`${apiBase()}/api/memories/extract`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, threadId }),
  });
  if (!res.ok) throw new Error(`Failed to extract memories: ${res.status}`);
  const data = (await res.json()) as { ids: string[] };
  return data.ids;
};

export const deleteMemory = async (id: string): Promise<void> => {
  await runApi((client) => client.memories.remove({ params: { id } }));
};
