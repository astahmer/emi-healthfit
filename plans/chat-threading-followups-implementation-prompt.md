# Chat threading follow-ups implementation session prompt

Implement `plans/chat-threading-followups.md` as one product task. Read `AGENTS.md` and the full plan,
then inspect the existing thread model, fake-data prototypes at `/gen-ui/thread-layouts`, tests, and
current mobile/desktop chat behavior.

Use the plan's locked-in decisions. Start by evaluating the six prototypes with browser-level keyboard,
narrow-screen, and realistic-depth checks. Promote the smallest production view set that is clearer
than the compact navigation; do not ship all prototypes merely because they exist. Record the evidence
and decision in the plan.

Complete the remaining user-facing thread work that follows from that decision: nested navigation,
clickable message-reference quote chips, pinned-thread shelf, search breadcrumbs and jump-to-context,
and automatic editable titles. Keep temporary conversations flat and do not implement merge semantics
or the React Flow map unless the plan's evidence gate is satisfied.

Add focused component and browser tests for desktop, mobile, keyboard use, deep nesting, search jumps,
references, pins, and temporary conversations. Preserve unrelated work. Split implementation into
coherent JJ revisions by behavior, not arbitrary files. Run the checks required by `AGENTS.md`, update
the plan with completed and deferred items, and report revision ids plus the prototype decision.
