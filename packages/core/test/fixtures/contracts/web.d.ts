export interface WebMcpModelContext {
  registerTool(
    tool: {
      readonly name: string;
      readonly description: string;
      readonly inputSchema: object;
      readonly execute: (input: unknown) => Promise<unknown>;
    },
    options?: { readonly signal?: AbortSignal },
  ): Promise<void>;
}

export declare class WebMcp {
  static detect(source: object): WebMcpModelContext | undefined;
}
