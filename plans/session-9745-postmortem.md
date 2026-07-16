# Session 9745 remediation plan

## Context

This postmortem covers conversation `9745e022-7b85-400c-83cb-db3ae60f8121`. It was inspected through
the signed-in persisted chat UI because the programmatic exporter in
[session-diagnostics.md](./session-diagnostics.md) does not exist yet.

Revision `4fc956d7` already fixed the trailing-semicolon validator bug, documented the SQL tool's real
capabilities, capped a generation at eight tool steps, logged `onFinish` failures, and added validator
tests. The deployed environment still needs a reproduction to confirm those changes address the
observed validator failure.

## Goal

The same workout-detail request completes accurately and within a bounded token/tool budget, failed
generations recover explicitly, and every visible tool/component state matches its persisted outcome.

## Confirmed findings

1. `query_database` was called seven times and all seven calls returned `Only one SELECT query is
   allowed.` The final attempt was one plain filtered `SELECT`, proving the validator rejected a valid
   shape rather than merely disallowing joins or subqueries.
2. Every failed SQL tool card displayed `Completed`. The structured output contained `type:
   error-text`, but the status treatment made failure look like success.
3. The assistant inferred restrictions that the tool never reported: it claimed joins, `GROUP BY`,
   aggregates, and even filters were forbidden. The only observed error concerned the number of
   statements.
4. The assistant repeated equivalent failing queries across four turns, including exact duplicates.
   It did not use the failure as a circuit-breaker signal or retain a useful failure strategy across
   turns.
5. The assistant asked the user to paste data or send a screenshot even though this is an owned-data
   workflow and the app should expose a stable workout-detail tool. This shifted internal tool failure
   onto the user.
6. The last SQL response said it would pull raw recent sets next, but the turn ended without another
   tool call. A response must not promise an immediate tool action after the tool loop has stopped.
7. The conversation consumed 66,053 tokens over six assistant turns for a small workout request. The
   largest turn used 17,235 tokens and still did not answer the exercise-breakdown question.
8. `render_component` received a `WorkoutTable` with one session but rendered `No workouts found.`
   The tool-input schema and component prop contract are out of sync, while the surrounding prose
   independently claimed the workout existed.
9. The user message `fais moi un programme pour demain` has no assistant message immediately after
   it. The next user message triggered a response that answered both prompts. This confirms an orphaned
   user turn in persisted history and matches the reported `Generation timed out` refresh state.
10. No browser console error was present during later inspection. Client-only logs therefore cannot
    explain the historical generation failure.

## Likely causes requiring telemetry confirmation

- The old SQL validator counted a trailing semicolon as evidence of multiple statements. Revision
  `4fc956d7` addresses this, but the deployed environment must be retested.
- The UI derives tool status from the presence of an output instead of discriminating success and
  structured failure output.
- Generation state is reconstructed from messages rather than persisted as a state machine, so a
  refresh can only guess that an unfinished turn timed out.
- Prompt context and tool results are repeatedly resent without a per-turn budget or compaction policy,
  contributing to token growth.

## Prioritized remediation backlog

### P0: correctness and recovery

1. Deploy and regression-test revision `4fc956d7` against all seven SQL shapes from this session.
2. Model tool outcomes as `pending | success | error`; render `error-text` as **Failed** with the exact
   safe error, never **Completed**.
3. Persist each generation as `pending | streaming | completed | failed | timed_out | cancelled`.
   On refresh, show the stored state and offer retry/resume without injecting an error into the composer.
4. Reconcile orphan user turns explicitly. A new submission must not silently merge two unanswered
   prompts; the UI should offer retry, discard, or send as a new turn.
5. Validate `render_component` props at tool execution and return a structured failure when the
   component contract is wrong. Add the failing `WorkoutTable.sessions` payload as a regression fixture.

### P1: tool and model behavior

1. Add `get_workout_details({ sessionId })` returning exercises, sets, reps, weights, and calculated
   volume. Make `get_workout_history` return a stable machine-readable session id.
2. Add a per-generation tool circuit breaker: do not execute an identical failed call twice, cap retries
   by normalized error code, and tell the model which alternative tools remain.
3. Instruct the model to report only the observed error, not invent unsupported capability limits.
4. Prevent prose such as “let me try next” unless another tool call occurs in the same generation.
5. Add per-turn token budgets, context compaction, and alerts for no-progress tool loops. Preserve the
   original user request and latest relevant tool evidence before older prose.

### P2: observability and advice quality

1. Implement the diagnostic bundle and analyzer in `session-diagnostics.md`.
2. Join Worker spans, provider metadata, tool execution, persistence, and client recovery through shared
   request, trace, and generation ids.
3. Calibrate health recommendations to data quality. When sleep is unavailable, label confidence and
   avoid stronger physiological claims than the available workload data supports.

## Implementation steps

1. Store the seven SQL calls, invalid component payload, orphan turn, and timeout as sanitized fixtures.
2. Ship P0 outcome, recovery, and component-contract changes with focused regression tests.
3. Ship `get_workout_details` and return stable ids from workout history.
4. Add circuit-breaking and token-budget behavior with a no-progress fixture.
5. Deploy to dev and replay the original user prompts against the fixture data.
6. Run the future `diagnose:session` command against the replay and compare it with this postmortem.

## Acceptance criteria

- [ ] Failed tools display and persist as failed, including after refresh.
- [ ] A timed-out generation has a durable reason and safe retry path.
- [ ] The seven SQL regression cases pass after deployment.
- [ ] The workout-detail request completes without raw SQL or user-supplied screenshots.
- [ ] The invalid `WorkoutTable` payload fails at the tool boundary instead of rendering empty data.
- [ ] Identical failed tool calls cannot repeat within one generation.
- [ ] The replay stays within the agreed per-turn tool and token budgets.
- [ ] A new user prompt cannot silently absorb an orphaned prompt.

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-16 | Prefer a domain workout-detail tool over model-authored SQL | It is safer, cheaper, and gives the model a stable contract. |
| 2026-07-16 | Treat tool-error presentation as P0 | Showing failure as completed destroys debugging and user trust. |
| 2026-07-16 | Keep confirmed evidence separate from inferred causes | Historical telemetry is incomplete. |
