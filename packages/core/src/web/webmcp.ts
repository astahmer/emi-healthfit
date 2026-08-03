export type WebMcpJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<WebMcpJsonValue>
  | { readonly [key: string]: WebMcpJsonValue };

export interface WebMcpPropertySchema {
  readonly type: "string" | "boolean";
  readonly enum?: ReadonlyArray<string>;
  readonly description?: string;
}

export interface WebMcpInputSchema {
  readonly type: "object";
  readonly properties?: Readonly<Record<string, WebMcpPropertySchema>>;
  readonly required?: ReadonlyArray<string>;
  readonly additionalProperties?: boolean;
}

export interface WebMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
  readonly untrustedContentHint?: boolean;
}

export interface WebMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: WebMcpInputSchema;
  readonly annotations?: WebMcpToolAnnotations;
  readonly execute: (input: unknown) => Promise<WebMcpJsonValue>;
}

export interface WebMcpModelContext {
  registerTool(
    tool: WebMcpTool,
    options?: {
      readonly signal?: AbortSignal;
      readonly exposedTo?: ReadonlyArray<string>;
    },
  ): Promise<void>;
}

const isModelContext = (value: unknown): value is WebMcpModelContext => {
  if (typeof value !== "object" || value === null) return false;
  if (!("registerTool" in value)) return false;
  return typeof value.registerTool === "function";
};

export class WebMcp {
  static detect(source: object): WebMcpModelContext | undefined {
    const candidate = Reflect.get(source, "modelContext");
    return isModelContext(candidate) ? candidate : undefined;
  }
}
