# API boundary cleanup

- **Status**: TODO
- **Commit audited**: `f163cac`
- **Scope**: API parsing/validation, error boundaries, controlled concurrency, lint guardrails

## Decisions from audit

| Concern | Decision |
| --- | --- |
| `createToolCircuitBreaker` | Keep. It has no Zod schema: it canonicalizes already-validated tool arguments to make a repeat-failure key. A recursive Effect schema here would validate internal data without changing safety. |
| Zod in `tools/api.ts` | Keep for now. `componentSchemas` is explicitly `Record<string, z.ZodType>` for json-render component contracts. Replace only if json-render accepts Effect/Standard Schema without an adapter. |
| Zod in export/diagnostics data | Migrate. These are application-owned persisted/imported contracts and should use Effect Schema. |
| `Reflect.get` | Remove only at untrusted/dynamic boundaries: diagnostic event payloads and AI stream chunks. Keep the Worker `fetch` binding handling (requires its receiver) and the type-erased HTTP handler lookup until Effect exposes typed routes. |
| tagged errors | Keep `return yield* Effect.fail(new BadRequest(...))`. `Effect.fail` is the effect that raises a tagged error; the error value itself cannot be yielded. `withInternalError` is also needed and already passes `BadRequest`, `NotFound`, and `InternalServerError` through unchanged. |
| `null`/`undefined` checks | Keep when modelling nullable D1 data or optional state. Do not replace normal option handling with schemas. |

## Problem

Several boundaries parse JSON imperatively before validation, so malformed input becomes a thrown `SyntaxError` and is frequently caught as a 500. Examples:

```ts
// apps/api/src/routes/chat.ts:273-274
const raw: unknown = JSON.parse(text || "{}");
const parsed = Schema.decodeUnknownOption(ChatStreamRequestSchema)(raw);

// apps/api/src/http-api-codecs.ts:7-10
const parseJson = (value: string): unknown => JSON.parse(value);
export const decodeMessageParts = (value: string) =>
  Schema.decodeUnknownSync(MessageParts)(parseJson(value));
```

Effect 4.0.0-beta.88 provides `Schema.fromJsonString(schema)`: it parses a JSON string and decodes the result through the supplied schema in one typed operation. `Schema.Trim` plus `Schema.NonEmptyString`/`isMinLength` should express required textual input at the API contract rather than imperative handler checks.

## Target

1. Define JSON-string schemas at boundaries:

```ts
const ChatStreamRequestFromJson = Schema.fromJsonString(ChatStreamRequestSchema);
const decoded = Schema.decodeUnknownOption(ChatStreamRequestFromJson)(text);
```

The empty body and malformed JSON must return the endpoint's documented 400 response; they must never reach the generic 500 handler.

2. Use application-owned Effect schemas for persisted message parts, generation chunks, diagnostic export/import data, and import payloads. Decode raw D1 strings with `Schema.fromJsonString` before mapping public DTOs.

3. Express normalized required fields once in `packages/api-contract`:

```ts
const RequiredText = Schema.Trim.pipe(Schema.check(Schema.isMinLength(1)));
```

Use it for conversation titles, memory-extraction text, suggestion text, and the chat client API key. Preserve API keys as opaque strings after rejecting empty/whitespace-only input; never log them in decode errors.

4. Use discriminated Effect schemas for dynamic stream/payload shapes instead of `Reflect.get` or casts. For the Worker asset binding, retain the current receiver-preserving call until a typed Cloudflare binding API is available.

## Steps

1. Add a small API-local codec module around `Schema.fromJsonString`; do not duplicate a new `parseJson` helper per route.
2. Migrate `apps/api/src/routes/chat.ts`, `routes/data.ts`, `http-api-codecs.ts`, `chat/generation-store.ts`, and `diagnostics/bundle.ts` one boundary at a time. Each migration gets malformed, valid, and persisted-corrupt JSON tests.
3. Convert `apps/api/src/ingest/data-transfer.ts` and the diagnostic bundle schema from Zod to Effect Schema. Retain public TypeScript types through `Schema.Schema.Type` rather than casts. Do not touch `tools/api.ts` Zod component schemas in this revision.
4. Move the residual `title === ""`, `text === ""`, `lastAssistantText === ""`, and empty API-key checks into contract schemas, then delete only the now-unreachable handler branches. Preserve semantic checks such as “conversation has no text to compact.”
5. Replace `Reflect.get` in `diagnostics/bundle.ts` and the AI chunk inspection in `routes/chat.ts` with schema decoders. Do not refactor the internal `handlerContext.mapUnsafe` lookup without a typed Effect HTTP API alternative.
6. Add contract encoding tests and real SQLite assertions for every changed persisted JSON scalar, per repository policy.

## Controlled concurrency

Only parallelize effects that are independent and whose output ordering is retained:

- In `http-api-conversations.ts:259`, fetch each thread's messages with `Effect.forEach(..., { concurrency: 4 })`; preserve input order in the returned `threads` array.
- In `memoryExtractionHandlers` at line 498, insert independent extracted snippets with `Effect.forEach(..., { concurrency: 4 })`, then filter null IDs. Do not reorder the response IDs.
- Keep stream chunk persistence, generation state transitions, thread-message writes, and mutation sequences ordered. Their order is part of chat correctness.

## Deterministic guardrails

Use Ast-Grep for project-specific policy. The installed Oxlint 1.73 CLI exposes built-in plugins only; its local help has no custom-plugin loading path, so do not invent an Oxlint plugin.

1. Add `@ast-grep/cli` and a `slop-rules/` directory.
2. Add source-only warning rules for `JSON.parse($$$)`, `Reflect.get($$$)`, and imperative `=== ""` validation in HTTP handlers. Exclude tests, scripts, migrations, and approved serializer code.
3. Add `pnpm slop:check` to CI. Start in report-only mode, baseline current approved locations, then make new violations fail after this cleanup lands.
4. Keep Oxlint's correctness/suspicious/perf groups enabled; add built-in restrictions only after confirming they produce no false positives.

## Verification

- Focused HTTP contract tests, generation-store tests, data-import tests, and diagnostic tests.
- `pnpm --filter @emi/api db:check` after schema changes; generate migrations only through the established Drizzle command if a structural schema change is actually required.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm format` once after the revision series.
