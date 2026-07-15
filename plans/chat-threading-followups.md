# Chat threading follow-ups

## Context

The conversation/thread schema, focused branch context, fork/summarize/discard/restore operations, explicit Effect tools, temporary mode, client-side search, and persisted focused-thread selection are implemented. Existing conversation history is normalized and covered by migration tests.

This plan contains only the remaining product work from the original threading plans.

## Remaining work

1. Evaluate the six fake-data prototypes at `/gen-ui/thread-layouts` before integrating any layout
   into the real chat. The sandbox includes all three desktop and all three mobile proposals.
2. After keyboard, narrow-screen, and realistic-depth testing, promote only the layouts that make
   branch location and switching clearer than the current compact navigation.
3. Add a view switcher and persist its selection only if testing supports multiple production views.
4. Add a read-only zoomed-out tree map after the navigation views are proven useful.
5. Render message-reference markup as clickable quote chips.
6. Add pinned-thread shelf affordances.
7. Add breadcrumbs and jump-to-context for conversation search results.
8. Add automatic thread titles from the first user message.
9. Decide whether model-created threads require approval after a configurable threshold.
10. Design merge semantics only after real usage demonstrates a need. Do not add schema or UI speculatively.

## Acceptance criteria

- Desktop and mobile users can navigate nested threads without relying on a native select.
- A search result identifies its branch and jumps to the matching message.
- Pinned threads remain visible while navigating the main conversation.
- Message references navigate to the referenced context.
- Every new view has browser-level coverage and remains compatible with temporary conversations.

## What

A first-class, tree-shaped conversation model where any message can spawn one or more persistent threads. Threads are not ephemeral side chats and they are not “new chat” hard forks. They live inside the same conversation, share history up to their fork point, and can be navigated, referenced, summarized, merged, or discarded.

Key properties:

- Every message has an optional `parent_id`.
- Sibling messages with the same parent are alternate continuations.
- A thread is a relational view anchored at a message (or fork point), not a separate storage bucket.
- Threads are persistent and searchable.
- Messages can reference other messages with `<message id="..." />`.
- The assistant can manage threads through explicit tools or through UI actions initiated by the user.

## Why

User feedback converges on a small set of pain points:

1. **Linear conversations are a bottleneck.** LLMs reason in trees, but chat UIs force a single line. Users want to explore “go deeper on point two” without losing the main conversation.
2. **Forks/side chats are too coarse.** Opening a new chat is a clean break; context is lost or duplicated. Existing side chats are ephemeral and disappear from history.
3. **Context pollution.** Every new tangent pollutes the main model context. Threads give isolated scopes that share only the relevant prefix.
4. **No follow-up to spawned work.** Sub-agents and side chats reset context for each new prompt. Users want continuity inside a branch.
5. **Need for time travel and branching.** Users want to compare alternatives, discard dead ends, and promote promising branches back to the main line.

## How

### Core model

```
Conversation
└─ Message A
   ├─ Message B
   │  └─ Message C   ← main trunk
   └─ Message D      ← fork from A
      ├─ Message E   ← thread 1
      └─ Message F
         └─ Message G
```

- Messages are stored as a flat list.
- `parent_id` builds the tree; ordering siblings by creation time (or explicit position) gives the projection.
- A `thread` is a named, anchored view: `thread.anchor_message_id` points to the fork/root message. All descendants of that anchor belong to the thread unless they are part of a deeper sub-thread.
- Threads are relational: the `thread_messages` table records which messages belong to which thread view. This lets the same message appear in multiple threads and lets threads be compacted independently.

### Operations

| Operation                  | What it does                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fork**                   | Create a new thread starting at any existing message. The new thread inherits all messages from the root conversation up to the fork point. |
| **Reply in thread**        | Add a message whose `parent_id` is inside a thread rather than on the main trunk.                                                           |
| **Create empty thread**    | Start a thread anchored at a message with no new messages yet, used as a scratchpad.                                                        |
| **Summarize thread**       | Replace a thread’s visible messages with a compact summary message that can be referenced by the parent or main trunk.                      |
| **Merge (promote)**        | Replace the main trunk from the fork point forward with the selected thread’s message chain. The previous trunk becomes an archived branch. |
| **Merge (append summary)** | Append a summary of the thread to the parent line without deleting anything. Non-destructive.                                               |
| **Discard**                | Mark a thread as discarded (soft delete). It disappears from the default tree view but remains in history.                                  |
| **Pin**                    | Keep a thread visible as a quick-access item inside the conversation.                                                                       |
| **Reference**              | Insert `<message id="..." />` in any message to point to another message across threads.                                                    |
| **Focus**                  | Enter a thread so the input box and history show only that thread’s context.                                                                |
| **Zoom out**               | Return to the parent or conversation root and see the full tree.                                                                            |

## What this allows

- Fork any message into a persistent thread without losing the original conversation.
- Ask follow-up questions inside a spawned context without resetting the model.
- Explore multiple alternatives in parallel and compare them.
- Keep the main trunk clean while going deep on tangents.
- Reference earlier messages precisely with `<message id="..." />`.
- Summarize long side explorations into compact, referenceable messages.
- Promote a promising branch to become the new line when merge is implemented.
- Search and revisit old threads hours or days later.
- Build agent harnesses where sub-tasks run in isolated threads that report back.
- Search the entire conversation from any view and jump to a message in its thread context.

## What this does not allow

- Cross-conversation threads. Threads are scoped to a single conversation.
- Full Git-style three-way merges with conflict resolution. Merge means “replace with” or “append summary”, not patch-based reconciliation.
- Real-time collaborative editing by multiple human users.
- Arbitrary reordering of messages in time (siblings are ordered by creation/position, but causality is preserved).
- Ephemeral threads. Every thread is persisted by default; discard only hides it.
- Threading in temporary conversations. Temporary mode stays a flat, in-memory, unsaved exchange with no threading UI or API.

## UI & UX

### Desktop proposal A — Inline accordion threads

Threads appear as collapsible cards attached to their fork message. The main trunk stays the primary scroll surface.

```
┌──────────────────────────────────────┐
│  You: Plan my workout for today      │
│  04:17 PM                            │
└──────────────────────────────────────┘
   ┌─────────────────────────────────┐
   │  ▼ Thread: "Upper focus" (4 msgs)
   │  Assistant: Chest + back...     │
   │  You: Add abs                   │
   └─────────────────────────────────┘
   ┌─────────────────────────────────┐
   │  ▶ Thread: "Lower focus" (2 msgs)
   └─────────────────────────────────┘
┌──────────────────────────────────────┐
│  Assistant: Here is the main plan... │
│  04:18 PM                            │
└──────────────────────────────────────┘
```

Pros: context-preserving; easy to scan. Cons: deeply nested threads can push the main line far apart.

### Desktop proposal B — Tree sidebar + main pane

A left sidebar shows the conversation tree. Clicking a thread focuses it in the main pane.

```
┌──────────┬───────────────────────────────┐
│ Workout  │  You: Plan my workout         │
│ ├─ Upper │  Assistant: Chest + back...   │
│ │  └─ Abs│  You: Add abs                 │
│ └─ Lower │  Assistant: Added 3 ab sets   │
│          │                               │
│ [Reply in Thread: Upper]                │
└──────────┴───────────────────────────────┘
```

Pros: scales to deep trees; clear navigation. Cons: tree sidebar consumes space; less immediate than inline.

### Desktop proposal C — Mona-style columns

Each tree level becomes a column. Selecting a message loads its children in the next column, like Finder column view.

```
┌─────────┬─────────────┬─────────────┐
│ Root    │ Fork point  │ Thread      │
│         │             │             │
│ Workout │ Upper focus │ Add abs     │
│         │ Lower focus │             │
└─────────┴─────────────┴─────────────┘
```

Pros: excellent for comparing siblings. Cons: needs horizontal space; awkward on small screens.

### Mobile proposal A — Drill-down stack

Tapping a thread opens it full-screen. A sticky header shows the fork message and a back button returns to the parent.

```
┌─────────────────────────┐
│ ← Upper focus           │
├─────────────────────────┤
│ forked from main plan   │
│                         │
│ Assistant: Chest...     │
│ You: Add abs            │
│                         │
│ [Reply...           ]   │
└─────────────────────────┘
```

Pros: simple mental model; native-feeling. Cons: moving between threads requires multiple taps.

### Mobile proposal B — Swipe columns

One column per tree level. Swipe left to enter a thread, swipe right to go back, like the X mobile client.

```
[Root]  ←swipe→  [Fork point]  ←swipe→  [Thread]
```

Pros: fast navigation; same paradigm as desktop Mona view. Cons: users may lose orientation; hard to show deep context.

### Mobile proposal C — Bottom sheet thread picker

The main chat stays linear. Long-press or tap a message to open a bottom sheet listing its threads, then pick one to focus.

```
┌─────────────────────────┐
│ Main chat               │
│                         │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ┌─────────────────────┐ │
│ │ Threads on this msg │ │
│ │ • Upper focus       │ │
│ │ • Lower focus       │ │
│ │ + New thread        │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

Pros: keeps main chat readable; quick access. Cons: less visual hierarchy than tree views.

### Recommendation

**Prototype decision:** keep all six options in the fake-data sandbox. Do not ship all six into the
real chat by default. Use the prototypes to select the smallest production set that proves clearer
than the compact navigation.

- **Desktop views:**
  1. Inline accordion (default).
  2. Tree sidebar + main pane.
  3. Mona-style columns.
- **Mobile views:**
  1. Drill-down stack (default).
  2. Swipe columns.
  3. Bottom sheet thread picker.

The current candidates are inline accordion on desktop and drill-down stack or bottom sheet on
mobile. If testing retains multiple views, persist the preference per device. The React Flow map
remains later work and must not be added until ordinary branch navigation is validated.

### Common interactions

| User action                  | Result                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Hover / long-press a message | Show fork actions: "Reply in thread", "Fork here", "Summarize thread".        |
| Click a thread card          | Focus that thread; input now replies inside it.                               |
| Breadcrumb                   | Shows `Conversation > Main > Upper focus > Abs`. Tap any segment to zoom out. |
| Thread menu                  | Summarize, merge (append or promote), discard, pin, rename.                   |
| References                   | Messages containing `<message id="..." />` render as clickable quote chips.   |
| New message in main trunk    | If currently inside a thread, offer "Reply in thread" vs "Reply in main".     |

## Locked-in decisions

| Topic                   | Decision                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Naming                  | Existing `threads` → `conversations`; nested units are `threads`.                                                          |
| Nesting                 | Unlimited nesting in the model; UI caps practical depth and offers zoom/focus.                                             |
| Persistence             | All threads are persistent. No ephemeral threads.                                                                          |
| Temporary conversations | Flat, in-memory, no DB save, no threading UI or API.                                                                       |
| Merge semantics         | Designed but not implemented. Schema must support future promote-snapshot and append-summary merges.                       |
| LLM tools               | Explicit thread tools: `getThreads`, `readThread`, `readMessage`, `createThread`, `summarizeThread`, `summarizeToMessage`. |
| Discarded threads       | Hidden from default LLM context; optionally show a one-line “explored and discarded” note.                                 |
| Message references      | Custom renderer turns `<message id="..." />` into clickable quote chips.                                                   |
| Pinned threads          | Per-conversation.                                                                                                          |
| Thread titles           | Auto-generated from first user message, editable.                                                                          |
| Desktop UI              | Implement inline accordion, tree sidebar, and Mona-style columns; user-switchable.                                         |
| Mobile UI               | Implement drill-down stack, swipe columns, and bottom sheet picker; user-switchable.                                       |
| Tree map                | Optional React Flow map view, not the primary surface.                                                                     |
| Search                  | Search whole conversation including threads; results include breadcrumb and jump-to-context.                               |
