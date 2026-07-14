# ADR 001: Generative UI renderer

## Status

Accepted

## Context

The assistant can answer with structured data (workouts, progress, recovery). Plain JSON in chat is hard to read, especially on mobile. We want the model to optionally render rich components: tables, charts, cards, set lists.

Requirements:
- Tool-driven: the model decides when to render UI, not free-text JSON.
- Type-safe props so malformed specs fail gracefully.
- Works with our existing stack: Vercel AI SDK, assistant-ui, shadcn/ui, Tailwind.
- Minimal architectural change.

Options considered:
- **json-render**: JSON spec + zod catalog, shadcn components, Vercel AI SDK transform, small surface area.
- **OpenUI**: Custom DSL/runtime, more token-efficient but adds a new language and backend concept.
- **Tambo**: Full-stack generative UI toolkit that owns the conversation loop; overlaps/conflicts with assistant-ui and our custom worker.

## Decision

Use **json-render** (`@json-render/core` + `@json-render/react`).

We expose a single API tool `render_component` that returns `{ spec: { root: { type, props } } }`. The frontend detects the tool result and renders it through a small catalog/registry mapping component names to our existing React components.

## Consequences

- New chat dependencies: `@json-render/core`, `@json-render/react`, `recharts`.
- New API tool: `render_component`.
- New frontend files: `app/gen-ui/catalog.ts`, `components/assistant-ui/gen-ui/registry.tsx`.
- Tool results that include rendered specs are now persisted with the assistant message, so charts/cards survive reloads and session switches.
- Future components only need a zod schema + registry entry.
