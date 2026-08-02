import type * as Context from "effect/Context";
import type * as Layer from "effect/Layer";
import type { ModelProvider } from "./protocol";

export interface AiSdkModelConfiguration {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly createId?: () => string;
}

export declare class AiSdkModelProvider extends Context.Service<
  AiSdkModelProvider,
  ModelProvider
>()("@emi/core/adapters/AiSdkModelProvider") {
  static layer(configuration: AiSdkModelConfiguration): Layer.Layer<AiSdkModelProvider>;
}
