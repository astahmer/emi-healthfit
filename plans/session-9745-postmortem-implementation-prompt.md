# Session 9745 remediation implementation session prompt

Implement `plans/session-9745-postmortem.md` as one remediation task. Read `AGENTS.md`, the full plan,
the linked diagnostics plan, revision `4fc956d7`, and the current message/tool rendering and generation
recovery code before editing.

Turn the persisted session evidence into fixtures first. Then complete P0: failed tool outcomes must
persist and render as **Failed**, generation state must survive refresh with an explicit retry path,
orphan user turns must not silently merge, and invalid component props must fail at the tool boundary.
Regression-test all seven SQL shapes from the session.

After P0 passes, add the stable owner-scoped `get_workout_details` domain tool, repeated-failure circuit
breaking, accurate error-language behavior, no empty “let me try next” promises, and bounded no-progress
token/tool behavior. Do not require the user to paste or screenshot data already owned by the app.

Use multiple coherent JJ revisions for fixtures, tool outcomes/UI, generation recovery, component
validation, domain tool, and loop/budget behavior. Preserve unrelated work, run focused tests plus the
checks required by `AGENTS.md`, update the plan checkboxes, and report revision ids, replay results,
token/tool counts, and any item deferred specifically to session diagnostics infrastructure.
