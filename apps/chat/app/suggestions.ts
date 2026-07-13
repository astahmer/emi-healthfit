export interface SuggestionsRequest {
  threadId?: string;
  messageId?: string;
  lastAssistantText: string;
  lastUserText?: string;
}

export interface SuggestionsResponse {
  suggestions: string[];
}

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

export const fetchSuggestions = async (request: SuggestionsRequest): Promise<string[]> => {
  const res = await fetch(`${apiBase()}/api/suggestions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(error.error || `Failed to load suggestions: ${res.status}`);
  }
  const data = (await res.json()) as SuggestionsResponse;
  return data.suggestions;
};
