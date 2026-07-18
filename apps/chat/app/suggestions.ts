interface SuggestionsConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface SuggestionsRequest {
  threadId?: string;
  messageId?: string;
  lastAssistantText: string;
  lastUserText?: string;
  config: SuggestionsConfig;
}

export const fetchSuggestions = async (request: SuggestionsRequest): Promise<string[]> => {
  const data = await runApi((client) => client.suggestions.generate({ payload: request }));
  return [...data.suggestions];
};
import { runApi } from "./api-client";
