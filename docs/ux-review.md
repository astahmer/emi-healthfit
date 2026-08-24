# UX Review — HealthFit Chat (2026-08)

Method: 15 real screenshots captured from the mock-mode build (desktop 1440px light/dark,
mobile 390px light/dark, streaming / queue / error / menus / all product pages), reviewed via
vision analysis plus DOM-level verification of suspicious findings. Screenshots: `/tmp/ux-shots/`,
rig: `apps/chat/scripts/ux-shots.mts`.

Legend: ✅ = verified in DOM/code · 👁 = vision-only finding (verify before acting)

## P1 — High impact

1. ✅ **i18n leak: French session menu** — `session-sidebar.tsx:266-334`: Partager /
   Télécharger / Renommer / Épingler / Désépingler / Supprimer + French delete-confirm dialog
   in an otherwise English UI. Replace with English strings (or run full i18n if intended).
2. 👁 **Raw query error surfaced to users** — Memory page shows
   `["memories","summary"] data is undefined` as page content when the summary query fails.
   Render a friendly error/empty state instead of leaking internals (react-query error path).
3. 👁 **Dual competing retry affordances after a failure** — error banner link
   ("Retry this request") AND outline button ("Retry coach response") below it. One primary
   recovery path; demote/merge the other.
4. 👁 **Model identity confusion** — reply metadata shows the generating model
   (e.g., "GPT-5.6 Terra") while composer shows the current default ("GPT-4o mini"), with no
   wording distinguishing "used for this reply" vs "next reply". Label explicitly
   ("Replied with …") or hide historical model behind details.
5. 👁 **Streaming feedback is weak** — pale "Thinking •••" on white, no elapsed time, Stop not
   prominent during the send-pending window. Stronger pulse/skeleton + always-visible Stop once
   a request is in flight.
6. 👁 **Empty states without a CTA** — Workouts empty state gives no path to Upload;
   Releases page is bare text; every Summary section repeats "No data in this period."
   monotonously. Add contextual CTAs (Workouts → "Upload an export"), icons/illustrations,
   and vary the copy.
7. 👁 **Suggestion cards on New Chat look non-clickable** — subtle borders only; add hover
   state, icon, and clearer button treatment. ~50% dead whitespace around them on mobile.

## P2 — Medium

8. ✅ **Duplicate "New chat" primary actions** — sidebar list item + header button. Keep one
   canonical entry point (sidebar), make the header one contextual (e.g., only when not on
   newest chat).
9. 👁 **Low-contrast muted text everywhere** — timestamps, "Synced x ago", helper text under
   upload fields, search/input placeholders (light gray on white flagged on nearly every
   screen; dark mode placeholders ~#9ca3af flagged too). Raise muted-foreground contrast one
   step app-wide.
10. ✅ **Token counts shown twice per assistant message** (meta line + footer) and cryptic to
    users ("30 tokens"). Deduplicate and either humanize ("≈ 30 words") or move into details.
11. 👁 **Message action row is an unlabeled icon wall** (copy / retry / fork / bookmark /
    save-to-memory / export). Group rare actions into an overflow menu; ensure 40px+ touch
    targets on mobile.
12. 👁 **Queue panel lacks purpose labeling** — "1. Second while streaming" with Edit/Send
    now/Cancel but nothing saying these send *after* the current reply. Add a header
    ("Queued — sends after the current reply").
13. 👁 **Tool-result cards blend into the conversation** — same visual weight as text turns;
    strengthen header/border distinction, keep Input collapsed.
14. ✅ **Composer control semantics are ambiguous** — model dropdown, Coach toggle, Web toggle
    and Temporary toggle share near-identical styling; active/inactive states barely differ.
    Visually separate pickers from toggles and strengthen active states.
15. 👁 **Upload page**: native file inputs only — add drag-and-drop zone; page heading is
    weaker than field labels; nav tab "Upload" duplicates the submit button's label.
16. 👁 **Summary dashboard**: thin em-dash placeholders read as broken; metric cards barely
    distinct from page background; verify metric labels for typos.
17. 👁 **Dark mode**: sidebar and main canvas nearly identical tone (poor surface separation);
    some action icons faintly contrasted. Strengthen elevation levels.
18. 👁 **Mobile feature parity gap** — Coach/Temporary toggles not reachable in the mobile
    composer (verified button inventory); model picker sits unconventionally at bottom-left
    without label.
19. 👁 **Mobile session title truncates** while dense icon toolbars take priority — rebalance
    header space; verify sidebar drawer overlay styling on small screens.

## P3 — Low / polish

20. 👁 Wide-viewport density: large empty bands above/below the thread; consider a subtle
    canvas tint or wider readable measure.
21. 👁 Reading rhythm: right-aligned user bubble ↔ left assistant block creates long horizontal
    jumps; tighten vertical rhythm and max-width alignment.
22. 👁 Timestamps float detached from message meta line; fold into the meta row.
23. 👁 Header subtitle "Personal gym assistant" is low contrast and redundant with brand.
24. 👁 Nav lacks grouping: product pages (Upload/Workouts/Trends) vs data features
    (Notes/Memory) vs Settings — group or divider.
25. ✅ Sidebar "Toggle Sidebar" click target is small; enlarge hit area, especially mobile.
26. 👁 Tool-card inner padding/radius inconsistent with outer bubbles.
27. 👁 Search placeholder in sidebar doubles as instructions; shorten and raise contrast.

## Already good

- Comprehensive aria-labels on nearly every interactive element (verified inventory).
- Keyboard queue editing (ArrowUp/Escape) is a genuinely nice power feature.
- Consistent SSE/streaming behavior; graceful offline messaging with local draft retention.
- Cross-tab queue sharing works and is test-covered.

## Suggested order

Quick wins first: #1 (string swap), #2 (error boundary on memory summary), #10/#12 (copy +
labels), then #3/#5 (error & streaming consolidation), then contrast pass (#9, #17), then
empty-state CTAs (#6, #23), then composer semantics (#14) and mobile parity (#18/#19).
