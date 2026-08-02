import type { ModelProvider } from "./protocol";

export interface AiSdkModelConfiguration {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly createId?: () => string;
}

export declare class AiSdkModelProvider {
  private constructor();
  static create(configuration: AiSdkModelConfiguration): ModelProvider;
}
