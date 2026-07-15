# Product and engineering ideas

This is the lightweight backlog for improvements that are useful but not part of the current implementation. Detailed threading concepts remain in [`plans/chat-threading-followups.md`](plans/chat-threading-followups.md).

## Delivered

- [x] Sidebar pin, archive/restore, and ancestry-preserving conversation cloning.
- [x] Versioned Health + Hevy JSON restore with validation, dry-run counts, and duplicate reporting.
- [x] Attachment limits, image compression, preparation progress, and clipboard errors.
- [x] Export record summaries and per-source date ranges.
- [x] Unified activity, body, sleep, training, and exercise Trends page.
- [x] Per-conversation token usage, configurable budgets, and model cost estimates.
- [x] Raw-upload retention plus selective Apple Health or Hevy deletion.

## Threading UX

Core persistence, branching, restoring, context selection, and model tools work today. The larger presentation system is still future product work:

- [x] Prototype the six-layout matrix with fake data at `/gen-ui/thread-layouts`.
- [ ] User-test the prototypes before promoting any layout into real chat.
- Prefer inline branches on desktop and drill-down/bottom-sheet navigation on mobile until testing shows a stronger option.

## Not sure what that means; clarify before doing anything:

- Add scheduled Health/Hevy ingestion with observable sync history and retry details.
- Add PWA/offline composition with queued sends and explicit reconciliation status.
- Add richer progress visualizations that explain their data window and missing-data assumptions.
- Show generation state in the UI and allow a safe server-owned cancellation after an execution lease expires.
