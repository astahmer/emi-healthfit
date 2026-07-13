export interface ChatModel {
  id: string;
  label: string;
  description: string;
  supportsWebSearch: boolean;
}

export const chatModels: ChatModel[] = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    description: "Fast, cheap, good for simple tasks",
    supportsWebSearch: false,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "Strong general-purpose model",
    supportsWebSearch: false,
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    description: "Cheap and capable",
    supportsWebSearch: false,
  },
  {
    id: "gpt-5.2-chat-latest",
    label: "GPT-5.2 Chat",
    description: "Default top-tier chat model",
    supportsWebSearch: false,
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    description: "Most capable, more expensive",
    supportsWebSearch: true,
  },
  {
    id: "gpt-5.2",
    label: "GPT-5.2",
    description: "Latest flagship with web search support",
    supportsWebSearch: true,
  },
];

export const defaultModel = chatModels[3];
