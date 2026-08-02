import type { ModelProvider } from "./server";

export interface AiSdkModelConfiguration {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export declare const createAiSdkModelProvider: (
  configuration: AiSdkModelConfiguration,
) => ModelProvider;
