export interface Memory {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
  rank?: number;
}

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

export const fetchMemories = async (search?: string, limit = 100): Promise<Memory[]> => {
  const params = new URLSearchParams();
  if (search !== undefined && search.trim() !== "") params.set("search", search.trim());
  params.set("limit", String(limit));
  const res = await fetch(`${apiBase()}/api/memories?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load memories: ${res.status}`);
  const data = (await res.json()) as { memories: Memory[] };
  return data.memories;
};

export const createMemory = async (
  content: string,
  source?: string,
  threadId?: string,
): Promise<string> => {
  const res = await fetch(`${apiBase()}/api/memories`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, source, threadId }),
  });
  if (!res.ok) throw new Error(`Failed to create memory: ${res.status}`);
  const data = (await res.json()) as { id: string };
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
  const res = await fetch(`${apiBase()}/api/memories/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete memory: ${res.status}`);
};
