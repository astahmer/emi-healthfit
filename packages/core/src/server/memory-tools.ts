import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Tool from "effect/unstable/ai/Tool";
import type { MemoryReaderShape, MemorySummaryStoreShape } from "./ports/memory-store.ts";

const memorySearchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)).annotate({
    description: "Concise keywords to find in the user's individual memory entries.",
  }),
  limit: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })).annotate({
      description: "Maximum number of source memory entries to return (default 10).",
    }),
  ),
});

const memorySummarySearchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)).annotate({
    description: "Concise keywords to find in the merged memory summary.",
  }),
});

const memorySearchTool = Tool.make("search_memories", {
  description:
    "Search individual source memory entries after checking search_memory_summary. Use this when the merged summary is missing or does not contain enough detail.",
  parameters: memorySearchInput,
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const memorySummarySearchTool = Tool.make("search_memory_summary", {
  description:
    "Search the compact merged memory summary first for earlier user preferences, goals, or constraints. If it is missing or insufficient, call search_memories for the source entries.",
  parameters: memorySummarySearchInput,
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

export class MemoryToolsError extends Schema.TaggedErrorClass<MemoryToolsError>()(
  "MemoryToolsError",
  {
    kind: Schema.Literal("invalid-input"),
    message: Schema.String,
  },
) {}

const decodeInput = <SchemaType extends Schema.Schema<unknown>>(
  schema: SchemaType,
  input: unknown,
) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(
      (cause) =>
        new MemoryToolsError({
          kind: "invalid-input",
          message: String(cause),
        }),
    ),
  );

const matchesSummary = ({ content, query }: { content: string; query: string }): boolean => {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u);
  const normalizedContent = content.toLocaleLowerCase();
  return terms.every((term) => normalizedContent.includes(term));
};

export class MemoryTools {
  static readonly searchName = memorySearchTool.name;
  static readonly searchDescription = Tool.getDescription(memorySearchTool) ?? "";
  static readonly searchInput = memorySearchInput;
  static readonly searchDefinition = Tool.getJsonSchema(memorySearchTool);
  static readonly summaryName = memorySummarySearchTool.name;
  static readonly summaryDescription = Tool.getDescription(memorySummarySearchTool) ?? "";
  static readonly summaryInput = memorySummarySearchInput;
  static readonly summaryDefinition = Tool.getJsonSchema(memorySummarySearchTool);

  static readonly search = Effect.fn("MemoryTools.search")(function* ({
    args,
    reader,
  }: {
    readonly args: unknown;
    readonly reader: Pick<MemoryReaderShape, "search">;
  }) {
    const input = yield* decodeInput(memorySearchInput, args);
    const results = yield* reader.search(input.query, { limit: input.limit ?? 10 });
    return { results };
  });

  static readonly searchSummary = Effect.fn("MemoryTools.searchSummary")(function* ({
    args,
    summary,
  }: {
    readonly args: unknown;
    readonly summary: Pick<MemorySummaryStoreShape, "get">;
  }) {
    const input = yield* decodeInput(memorySummarySearchInput, args);
    const value = yield* summary.get();
    return {
      summary:
        value !== undefined && matchesSummary({ content: value.content, query: input.query })
          ? value
          : null,
    };
  });
}
