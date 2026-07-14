export interface SuggestionsConfig {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface SuggestionsRequest {
  threadId?: string;
  messageId?: string;
  lastAssistantText: string;
  lastUserText?: string;
  config?: SuggestionsConfig;
}

const suggestionsResponseSchema = z.object({ suggestions: z.array(z.string()) });
const errorResponseSchema = z.object({ error: z.string().optional() });

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

export const fetchSuggestions = async (request: SuggestionsRequest): Promise<string[]> => {
  const res = await fetch(`${apiBase()}/api/suggestions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const error = errorResponseSchema.safeParse(await res.json().catch(() => ({})));
    throw new Error(
      error.success && error.data.error !== undefined
        ? error.data.error
        : `Failed to load suggestions: ${res.status}`,
    );
  }
  const data = suggestionsResponseSchema.parse(await res.json());
  return data.suggestions;
};
import { z } from "zod";
