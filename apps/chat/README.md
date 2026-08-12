# Chat frontend

Vite chat UI with TanStack Router, an XState-owned runtime, and Vercel AI SDK transport. Message history, streaming state, per-session composer drafts, attachments, tool results, and resumable reconnects are independent of rendering primitives.

## Development

```bash
pnpm install
pnpm --filter chat dev
```

Open [http://localhost:3232/chat](http://localhost:3232/chat).

Production assets are built by Alchemy (`Command.Build` in `apps/api/src/api.worker.ts`). Run `pnpm release` from the repository root to create a timestamped GitHub Release; its published-release workflow stamps the deployed build with a UTC date version, deployment time, immutable commit, and release tag. The same release metadata creates the in-app `/releases` history from revision descriptions.

Key files:

- `app/chat/chat-runtime-machine.ts` — valid runtime states and message ownership
- `app/chat/chat-runtime.tsx` — streaming transport, reconnect, and session isolation
- `components/chat/thread.tsx` — shadcn-based message and composer UI
- `app/chat/page.tsx` — conversation shell and URL selection
