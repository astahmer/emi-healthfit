import type { ModelProvider } from "./server";

export interface AiSdkModelConfiguration {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export declare class AiSdkModelProvider {
  private constructor();
  static create(configuration: AiSdkModelConfiguration): ModelProvider;
}
