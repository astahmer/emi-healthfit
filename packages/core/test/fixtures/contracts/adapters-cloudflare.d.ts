import type { ChatRepositories } from "./server";

export interface CloudflareDatabase {
  prepare(query: string): {
    bind(...values: ReadonlyArray<unknown>): {
      all(): Promise<{ results: ReadonlyArray<unknown> }>;
      first(): Promise<unknown | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
}

export interface CloudflareAdapterOptions {
  readonly database: CloudflareDatabase;
}

export declare class CloudflareRepositories {
  private constructor();
  static fromDatabase(options: CloudflareAdapterOptions): ChatRepositories;
}
