export interface ChatModel {
  id: string;
  label: string;
  description: string;
  supportsWebSearch: boolean;
  pricing: { inputUsdPerMillion: number; outputUsdPerMillion: number };
}

export const chatModels: ChatModel[] = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    description: "Fast, cheap, good for simple tasks",
    supportsWebSearch: false,
    pricing: { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "Strong general-purpose model",
    supportsWebSearch: false,
    pricing: { inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 },
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    description: "Cheap and capable",
    supportsWebSearch: false,
    pricing: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 2 },
  },
  {
    id: "gpt-5.2-chat-latest",
    label: "GPT-5.2 Chat",
    description: "Default top-tier chat model",
    supportsWebSearch: false,
    pricing: { inputUsdPerMillion: 1.75, outputUsdPerMillion: 14 },
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    description: "Most capable, more expensive",
    supportsWebSearch: true,
    pricing: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
  },
  {
    id: "gpt-5.2",
    label: "GPT-5.2",
    description: "Latest flagship with web search support",
    supportsWebSearch: true,
    pricing: { inputUsdPerMillion: 1.75, outputUsdPerMillion: 14 },
  },
];

export const defaultModel = chatModels[3];
