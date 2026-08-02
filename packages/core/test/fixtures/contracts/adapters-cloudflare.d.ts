import type { ChatRepositories } from "./server";

export interface CloudflareDatabase {
  prepare(query: string): {
    bind(...values: ReadonlyArray<unknown>): unknown;
  };
}

export interface CloudflareAdapterOptions {
  readonly database: CloudflareDatabase;
}

export declare class CloudflareRepositories {
  private constructor();
  static fromDatabase(options: CloudflareAdapterOptions): ChatRepositories;
}
