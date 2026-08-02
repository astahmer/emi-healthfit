export interface ServerDatabaseQueryClient<TSchema = unknown, TEnvironment = never> {
  readonly schema: TSchema;
  readonly environment: TEnvironment;
}

export declare class ServerDatabase {
  static readonly app: {
    readonly composeSystemPrompt: (...contributors: ReadonlyArray<unknown>) => string;
  };
  static readonly conversations: Record<string, (...arguments_: ReadonlyArray<unknown>) => unknown>;
  static readonly conversationRevision: Record<
    string,
    (...arguments_: ReadonlyArray<unknown>) => unknown
  >;
  static readonly discordLinks: Record<string, (...arguments_: ReadonlyArray<unknown>) => unknown>;
  static readonly generations: Record<string, (...arguments_: ReadonlyArray<unknown>) => unknown>;
  static readonly memories: Record<string, (...arguments_: ReadonlyArray<unknown>) => unknown>;
  static readonly query: Record<string, (...arguments_: ReadonlyArray<unknown>) => unknown>;
  static readonly replay: Record<string, (...arguments_: ReadonlyArray<unknown>) => unknown>;
  static readonly conversationReader: Record<string, unknown>;
  static readonly conversationWriter: Record<string, unknown>;
  static readonly messageStore: Record<string, unknown>;
  static readonly threadStore: Record<string, unknown>;
  static readonly storeLive: Record<string, unknown>;
  static readonly errors: Record<string, unknown>;
  static readonly tables: Record<string, unknown>;
}

export declare namespace ServerDatabase {
  type AppDefinition = unknown;
  type Conversation = unknown;
  type ConversationDatabaseSchema = unknown;
  type DiscordDatabaseSchema = unknown;
  type MemoryDatabaseSchema = unknown;
  type QueryDatabaseClient<TSchema = unknown, TEnvironment = never> = ServerDatabaseQueryClient<
    TSchema,
    TEnvironment
  >;
}
