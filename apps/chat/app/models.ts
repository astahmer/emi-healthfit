import type { ModelDescriptor } from "@emi/core/protocol";
import catalog from "./models.json";

export type ChatModel = ModelDescriptor;

interface ChatModelCatalog {
  pricingSource: string;
  lastReviewed: string;
  defaultModelId: string;
  models: ChatModel[];
}

export const modelCatalog = catalog satisfies ChatModelCatalog;
export const chatModels = modelCatalog.models;

const requireModel = (modelId: string): ChatModel => {
  const model = chatModels.find((candidate) => candidate.id === modelId);
  if (model === undefined) throw new Error(`Unknown default chat model: ${modelId}`);
  return model;
};

export const defaultModel = requireModel(modelCatalog.defaultModelId);
