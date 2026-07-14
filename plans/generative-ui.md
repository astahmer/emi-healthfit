# Generative UI plan

## Context

- Frontend: Next.js static export, `assistant-ui`, Vercel AI SDK, shadcn/ui, Tailwind.
- Backend: Cloudflare Worker (`apps/api`), Effect, D1.
- Tool results are currently plain JSON rendered in the chat. We want the assistant to produce rich, interactive components (workout tables, exercise-progress charts, recovery cards, etc.).

## Goal

Let the LLM answer fitness questions with structured UI components rendered inside the chat thread, not just text/JSON.

## Reference repositories

- `.references/json-render` — https://github.com/vercel-labs/json-render
- (optional) `.references/openui` — https://github.com/thesysdev/openui
- (optional) `.references/tambo` — https://github.com/tambo-ai/tambo

## Option evaluation

| Option | Fit | Notes |
|--------|-----|-------|
| **json-render** | Best | JSON spec + zod catalog, ships shadcn/ui components, streams, has Vercel AI SDK transform. Least invasive. |
| OpenUI | Good | More token-efficient custom lang, but adds a new DSL/runtime and another backend concept. |
| Tambo | Overlap | Full-stack generative UI toolkit that owns the conversation loop; conflicts with assistant-ui + our custom worker. |

**Decision:** start with `json-render`. Evaluate OpenUI later if token usage becomes a problem.

## Architecture

Use a tool-driven approach so the model never emits raw UI JSON in free text:

1. Define a component catalog (zod schemas + descriptions) that the model is allowed to invoke.
2. Expose a new API tool `render_component`.
3. The model calls `render_component` with a component name and props.
4. The tool returns a JSON-render spec.
5. The frontend detects the `render_component` tool result and renders it with `<Renderer spec={...} registry={registry} />`.

This keeps the assistant in control of *when* to render UI while keeping the UI contract type-safe.

## Proposed catalog (start small)

| Component | Props | Use case |
|-----------|-------|----------|
| `WorkoutTable` | `workouts: {date, title, volumeKg, exercises, sets}[]` | Answer “show my recent workouts” |
| `ExerciseProgress` | `exerciseTitle, weeks, workouts[], personalRecord` | Answer “plot my bench progress” |
| `RecoveryCard` | `label, explanation, sleepAvg, lastWorkout, recentVolume` | Answer “how is my recovery?” |
| `MetricCard` | `label, value, unit, trend?` | Quick single-value answers |
| `SetList` | `sets: {exercise, weightKg, reps, rpe, setType}[]` | Expand a single workout |

All components map to existing shadcn/ui building blocks + `recharts` for charts.

## Implementation steps

1. **Add dependencies** to `apps/chat`:
   - `@json-render/core`
   - `@json-render/react`
   - `@json-render/shadcn` (for pre-built shadcn definitions)
   - `recharts` if not already present.
2. **Create catalog** in `apps/chat/app/gen-ui/catalog.ts`:
   - Import `schema` from `@json-render/react/schema`.
   - Define components with zod props schemas and descriptions.
   - Define any read-only actions (start with none).
3. **Create registry** in `apps/chat/components/assistant-ui/gen-ui/registry.tsx`:
   - Map catalog names to real React components.
   - Use existing shadcn `Card`, `Table`, `Badge`, etc.
   - Use `recharts` for `ExerciseProgress`.
4. **Add the `render_component` tool** in `apps/api/src/tools/api.ts`:
   - JSON Schema parameter: `{ component: string, props: object }`.
   - Handler builds/returns the spec object; no DB access required.
5. **Wire tool-result rendering** in `apps/chat/components/assistant-ui/tool-result-content.tsx`:
   - If tool name is `render_component`, parse `result.spec` and render `<Renderer />`.
   - Wrap in an `ErrorBoundary` that falls back to the raw JSON renderer on malformed specs.
6. **Update the fitness-coach prompt** (`apps/api/src/chat/prompts/fitness-coach-v1.ts`):
   - Tell the model it can call `render_component` whenever the answer benefits from tables, charts, or cards.
7. **Seed initial UI cases**:
   - Workout history → `WorkoutTable`.
   - Exercise progress → `ExerciseProgress`.
   - Recovery → `RecoveryCard`.
8. **Add tests**:
   - Unit test the catalog/registry mapping.
   - Unit test the API tool handler.
   - Visual smoke test in the chat.
9. **Run checks**: `pnpm typecheck`, `pnpm lint`, `pnpm fmt`.

## Optional: streaming generative UI

Once the tool-driven path works, we can let the assistant stream a spec directly via Vercel AI SDK `streamObject` for open-ended requests (e.g., “build me a dashboard”). json-render has `SpecStream` utilities for partial rendering. Defer until the tool path is shipped.

## Open questions

- Should generated components be interactive (buttons, filters)? Start read-only to avoid state complexity.
- Should the catalog live in the API so the model prompt can be generated from it, or only in the frontend? Keep it shared via a small JSON schema file both sides import.
- How do we handle model-generated prop values that don’t match the zod schema? json-render validation will fail; fallback to JSON.

## Acceptance criteria

- “Show my last 5 workouts” renders a styled table instead of JSON.
- “Plot my squat progress” renders a line chart + PR card.
- “How is my recovery?” renders a card with sleep and volume info.
- Malformed specs show the raw tool result, not a crash.
