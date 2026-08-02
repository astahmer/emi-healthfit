import type { ChatRepositories } from "./server";

export interface CloudflareDatabase {
  prepare(query: string): {
    bind(...values: ReadonlyArray<unknown>): unknown;
  };
}

export interface CloudflareAdapterOptions {
  readonly database: CloudflareDatabase;
}

export declare const createCloudflareRepositories: (
  options: CloudflareAdapterOptions,
) => ChatRepositories;
