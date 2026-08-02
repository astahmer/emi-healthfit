import type * as Context from "effect/Context";
import type * as Layer from "effect/Layer";

interface CloudflareBoundStatement {
  readonly all: () => Promise<{ readonly results: ReadonlyArray<unknown> }>;
  readonly first: () => Promise<unknown | null>;
  readonly run: () => Promise<{ readonly meta: { readonly changes: number } }>;
}

interface CloudflarePreparedStatement {
  readonly bind: (...parameters: ReadonlyArray<unknown>) => CloudflareBoundStatement;
}

interface CloudflareDatabase {
  readonly prepare: (query: string) => CloudflarePreparedStatement;
}

interface CloudflareRepositoriesShape {
  readonly conversations: unknown;
  readonly messages: unknown;
  readonly generations: unknown;
  readonly memories: unknown;
}

interface CloudflareAdapterOptions {
  readonly database: CloudflareDatabase;
  readonly createId?: () => string;
  readonly now?: () => string;
}

export declare class CloudflareRepositories extends Context.Service<
  CloudflareRepositories,
  CloudflareRepositoriesShape
>()("@emi/core/adapters/cloudflare/Repositories") {
  static layer(options: CloudflareAdapterOptions): Layer.Layer<CloudflareRepositories>;
}
