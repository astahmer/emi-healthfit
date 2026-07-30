# Improvements backlog

This is an evidence-based backlog discovered while planning the core chat platform. It is intentionally separate from product plans: entries remain until fixed or explicitly declined.

## P0 — misleading scaffold

- `apps/generic-worker/src/generic.worker.ts` now uses public core streaming/replay, conversation-action, and branch route factories, but still needs settings APIs and a web asset deployment path.
- `packages/create-chat-app` now emits an owned `core/` workspace by default and retains dependency mode for external core. It still needs a versioned generated-source manifest plus an upgrade command that preserves local edits.
- `pnpm --dir packages/create-chat-app test:generated` now proves install, typecheck, migration generation/check, and web build. Add local Worker smoke, browser chat smoke, and an Alchemy dry run without requiring production credentials.

## P0 — core extraction boundaries

- Generic chat lifecycle and memory/title/suggestion orchestration still live under `apps/api/src/core`. Provider streaming, durable generation storage/replay, and protocol helpers now live behind public core exports; move the remaining server services next.
- Generic browser runtime, transport, composer, thread renderer, minimap, and settings still live under `apps/chat`. Generic fixture now has a focused XState session machine and basic branch navigation; extract reusable UI primitives before adding more generic behavior.
- Generic session state now uses the exported `@emi/core/web` XState machine instead of a React reducer. Keep sidebar search and memory-input state local; they are independent view state, not chat protocol transitions. Next extract transport ownership and presentational chat primitives from the generic app.
- Public core exports currently expose a small shell and a few rendering helpers, not a complete chat application API. Define intentional public entry points and test their dependency boundaries.

## P1 — product contracts and persistence

- Give generic settings, release metadata, dynamic component envelopes, attachment metadata, summaries, and feature flags explicit runtime schemas. Avoid `Schema.Unknown` at public/persisted boundaries where a stable shape is known.
- Separate generic tables from HealthFit tables in the scaffold schema and keep Drizzle schemas as sole migration source.
- Add real SQLite contract/integration tests whenever persisted payloads or API DTOs move during extraction.
- Make temporary-chat and memory-retention policy explicit in contracts, UI labels, and tests.

## P1 — user experience

- Promote the existing HealthFit conversation features into a core feature matrix with baseline vs optional status; users cannot currently tell what generic chat receives.
- Make summarization and provider credentials configurable per app, with safe defaults and clear local/server storage behavior. Generic title generation accepts optional model and prompt overrides; compaction uses the selected chat model, while memory extraction has its own local model setting.
- Extract generic sidebar, queue, attachments, minimap, message actions, and scroll controls into reusable `@emi/core/web` primitives rather than leaving the current generic fixture app-local.
- Expand PWA behavior from its safe installable shell and local drafts: opt-in encrypted history cache, background sync for safe non-streaming actions, and explicit resume state for interrupted generations.

## P2 — developer experience and distribution

- Add a generated-app manifest with source version, mode, feature flags, and hashes. `create-chat-app upgrade` should show a diff and preserve modified files.
- Make the generated app's first-run/deploy path executable in CI: install, typecheck, Drizzle generate/check, local Worker smoke, browser chat smoke, and Alchemy dry run.
- Generic web currently produces a 509 kB minified entry bundle after adding XState. Split settings/history and other cold sidebar features before this grows further.
- Add an extension guide covering custom auth, prompts, tools, dynamic components, theme, release history, provider adapters, and data retention.
- Keep `apps/generic-web` / `apps/generic-worker` as continuously tested canonical fixtures, not a second hand-written product.
