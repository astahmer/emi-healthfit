# Chat frontend

Next.js static chat UI with an XState-owned runtime and Vercel AI SDK transport. Message history, streaming state, per-session composer drafts, attachments, tool results, and resumable reconnects are independent of rendering primitives.

## Development

```bash
pnpm install
pnpm --filter chat dev
```

Open [http://localhost:3000/chat](http://localhost:3000/chat).

Key files:

- `app/chat/chat-runtime-machine.ts` — valid runtime states and message ownership
- `app/chat/chat-runtime.tsx` — streaming transport, reconnect, and session isolation
- `components/chat/thread.tsx` — shadcn-based message and composer UI
- `app/chat/page.tsx` — conversation shell and URL selection
