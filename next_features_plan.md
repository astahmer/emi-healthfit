# Next features plan

## Context

`Emi HealthFit` is a personal fitness assistant. The current data model is:

- `daily_activity` — steps, active kcal, distance, exercise minutes, flights climbed.
- `health_workouts` — Apple Health workouts (type, duration, heart rate, distance, etc).
- `hevy_sessions` / `hevy_sets` — structured strength workouts from Hevy.
- `sleep_sessions` — sleep start/end, in-bed/asleep/awake minutes.
- `body_metrics` — weight, body fat %, lean mass.

Current tools are `get_summary`, `get_recovery`, and `query_database`. Chat uses the Vercel AI SDK + assistant-ui. Sessions are ephemeral until the plan below is implemented.

---

## 1. Session history / shareable sessions (in progress)

Goal: ChatGPT-style sessions that persist in D1, have auto-generated titles, are searchable, and each has its own URL (`/chat?id=<sessionId>`).

### Backend

- New tables:
  - `threads(id, title, created_at, updated_at, status)`
  - `messages(id, thread_id, role, parts JSON, created_at)`
- New endpoints:
  - `GET /api/threads?search=...` — list sessions, sorted by `updated_at DESC`.
  - `POST /api/threads` — create a new session and return its id.
  - `GET /api/threads/:id/messages` — load UIMessages for a session.
  - `PATCH /api/threads/:id/title` — rename a session.
  - `DELETE /api/threads/:id` — delete a session and its messages.
- Update `POST /api/chat`:
  - Accept `sessionId` in the request body.
  - Load existing messages for the session, prepend them to the incoming turn, stream the response.
  - Persist the new user messages and the assistant response.
  - If the session has no title yet, generate one with a cheap model (`gpt-4o-mini`) from the first user message.

### Frontend

- `/chat` without `?id=` shows a welcome screen + “New chat” button.
- “New chat” calls `POST /api/threads`, then navigates to `/chat?id=<id>`.
- `/chat?id=<id>` loads messages and passes them as `initialMessages` to the chat runtime.
- A collapsible sidebar on the chat page lists sessions, shows the title + last-updated time, supports search, and has delete/rename actions.
- Active session is highlighted from the URL.

### Open questions

- Should we later move from `/chat?id=...` to `/chat/[id]`? Yes, once this works.
- Should archived sessions be shown? Start with a simple `status` column but keep UI regular-only.

---

## 2. Follow-up question suggestions

Goal: After the assistant finishes a response, show up to 5 one-tap follow-up chips below the last assistant message.

### Backend

- Add `POST /api/suggestions`.
- Body: `{ threadId, lastAssistantText, lastUserText }`.
- Use a cheap model (`gpt-4o-mini`) with a tiny prompt:
  > “Given this conversation, suggest 5 short, natural follow-up questions the user might ask. Return only a JSON array of strings.”
- Return `{ suggestions: string[] }`.

### Frontend

- New component `FollowUpChips` that watches the last assistant message.
- When the run completes, call `/api/suggestions` and render chips.
- Clicking a chip sends the text as a new user message.

### Later improvements

- Cache suggestions per message so they don’t re-fetch on re-render.
- Generate them client-side for speed if the model is cheap enough.

---

## 3. More fitness-focused tools

The existing `query_database` tool is powerful but the model often doesn’t know the schema. Dedicated tools make it faster and cheaper.

Proposed tools (all read-only):

| Tool | Data source | Use case |
|------|-------------|----------|
| `get_workout_history(limit?)` | `hevy_sessions` | List recent workouts with date, title, volume, exercises. |
| `get_workout_details(session_id)` | `hevy_sessions` + `hevy_sets` | Full sets for a specific workout. |
| `get_exercise_progress(exercise_title, weeks?)` | `hevy_sets` | Weight/rep/volume trend + current PR for an exercise. |
| `get_personal_records()` | `hevy_sets` | Best weight × reps per exercise. |
| `get_workout_streak()` | `hevy_sessions` | Current / longest consecutive workout streak. |
| `get_sleep_trend(days?)` | `sleep_sessions` | Avg sleep over N days. |
| `get_steps_trend(days?)` | `daily_activity` | Steps and active kcal trend. |
| `get_body_metrics_trend(days?)` | `body_metrics` | Weight / body fat / lean mass trend. |
| `compare_workouts(title, limit?)` | `hevy_sessions` | Compare the last N instances of the same workout title. |
| `find_workouts(query)` | `hevy_sessions` | Search workouts by title or exercise name. |

### Implementation notes

- Add one `db/operations.ts` helper per tool.
- Register each in `tools/api.ts` with a clear description and JSON Schema parameters.
- Start with the most useful 3–4: `get_workout_history`, `get_exercise_progress`, `get_sleep_trend`, `get_workout_streak`.

---

## 4. Other improvements to consider

- **Mobile layout**: once the session sidebar exists, make it collapsible and full-width on small screens.
- **Cost tracking**: store token usage per message (`usage` from `streamText` `onFinish`) and show a small indicator.
- **Better tool result rendering**: render workout tables, recovery cards, and web-search citations as rich UI instead of raw JSON.
- **Error boundaries**: better handling of streaming / network errors in the chat UI.
- **Light/dark toggle**: the app is currently forced to `dark`.
- **Input file attachments**: allow attaching images/docs to a message (assistant-ui supports this already, but not wired up).
- **Caching**: cache `get_recovery` / `get_summary` results for a few minutes to avoid repeated DB calls.
- **Rate limiting / max messages**: protect the worker from abuse.

---

## Suggested order

1. Finish session history + shareable links (this unlocks everything else).
2. Follow-up suggestions — small, high visible value.
3. Add the top fitness tools (`get_workout_history`, `get_exercise_progress`, `get_sleep_trend`).
4. Polish: mobile layout, cost tracking, rich tool result rendering.
