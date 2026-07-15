# Product and engineering ideas

This is the lightweight backlog for improvements that are useful but not part of the current implementation. Detailed threading concepts remain in [`plans/chat-threading-followups.md`](plans/chat-threading-followups.md).

## Near term

- Finish sidebar actions: pin, archive/restore, and clone a conversation while preserving message ancestry.
- Add an import/restore flow for the versioned Health + Hevy JSON export, including dry-run validation and duplicate reporting.
- Add attachment limits, compression progress, and clearer errors for unsupported clipboard images.
- Add export summaries and per-source date ranges before downloading large datasets.
- add more stats, charts and graphs in a Summary page (e.g., daily activity, body metrics, sleep, and exercise progress, etc etc. anything useful that you can think of).

## Threading UX

Core persistence, branching, restoring, context selection, and model tools work today. The larger presentation system is still future product work:

- Prototype and user-test the six-layout matrix: inline accordion, tree sidebar, desktop columns, mobile drill-down, mobile swipe columns, and a mobile bottom-sheet picker.
- Prefer inline branches on desktop and drill-down/bottom-sheet navigation on mobile until testing shows a stronger option.

## Product and operations

- Add model cost estimates, token budgets, and per-conversation usage history.
- Add privacy controls for raw uploads, retention windows, and selective deletion by data source.

## Not sure what that means; clarify before doing anything:

- Add scheduled Health/Hevy ingestion with observable sync history and retry details.
- Add PWA/offline composition with queued sends and explicit reconciliation status.
- Add richer progress visualizations that explain their data window and missing-data assumptions.
- Show generation state in the UI and allow a safe server-owned cancellation after an execution lease expires.
