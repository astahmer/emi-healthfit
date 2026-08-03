export interface WebMcpModelContext {
  registerTool(
    tool: {
      readonly name: string;
      readonly description: string;
      readonly inputSchema: object;
      readonly execute: (input: unknown) => Promise<unknown>;
    },
    options?: { readonly signal?: AbortSignal; readonly exposedTo?: ReadonlyArray<string> },
  ): Promise<void>;
}

export interface ComponentRendererContribution {
  readonly name: string;
  readonly component: (input: {
    readonly props: Readonly<Record<string, unknown>>;
    readonly children: unknown;
    readonly className?: string;
  }) => unknown;
}

export declare const decodeDynamicComponent: (value: unknown) => unknown;
export declare const DynamicComponentRenderer: (input: {
  readonly value: unknown;
  readonly className?: string;
}) => unknown;

export declare class WebMcp {
  static detect(source: object): WebMcpModelContext | undefined;
}
