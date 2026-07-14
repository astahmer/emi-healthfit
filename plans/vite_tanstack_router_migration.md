# Vite and TanStack Router migration

## Decision

Migrate the chat frontend from Next.js static export to Vite and TanStack Router.

The application is a client-rendered SPA backed by a separate Cloudflare Worker. It does not use server components, server actions, route handlers, SSR, or Next image optimization. Next static export currently prevents a real dynamic `/chat/:sessionId` route and ignores rewrites, forcing the Worker and browser-history compatibility layer to understand exported asset paths. TanStack Router directly models the desired path, gives typed path and search parameters, and matches the repository's Vite toolchain requirement.

Keep AI SDK for model/tool/UI-message protocol and Effect for effects, streams, schemas, HTTP, and lifecycle services. TanStack Router replaces routing only. TanStack Query remains the remote-state cache. XState remains owner of interactive chat state.

## Benefits

- `/chat/$sessionId` becomes a first-class typed route instead of a pathname parser over one exported `/chat` page.
- Search parameters for model and composer flags become route schemas instead of React synchronization hooks.
- The static build no longer emits warnings about unsupported rewrites.
- Next-specific navigation mocks, static-export constraints, and Worker asset remapping shrink substantially.
- Vite aligns local development, tests, and production bundling around the same module graph.

## Costs and risks

- Replace Next layouts, metadata, navigation, links, fonts, and configuration.
- Move Serwist's Next integration to its Vite integration or an equivalent service-worker build.
- Preserve the current offline shell, Dexie conversation cache, and direct Worker asset fallback.
- Re-test CSS order, environment variables, asset URLs, and installability.
- A future requirement for React Server Components or Next SSR would remove the main reason for this migration; no such requirement exists now.

## Target route tree

```text
__root
├── /
│   └── redirect to /chat
├── /chat
│   └── temporary or unsaved chat
├── /chat/$sessionId
│   └── persisted or resumable chat
└── /settings
```

The `/chat` and `/chat/$sessionId` routes share one chat layout. Validate `model`, `coach`, and `web` as typed search parameters. Route changes send XState events; they do not copy server or runtime state into React state.

## Migration revisions

1. Add Vite and TanStack Router alongside the existing Next build. Create the root route, `/chat`, `/chat/$sessionId`, and `/settings`; keep UI components unchanged.
2. Replace `next/navigation` and `next/link`, then delete `use-session-params.ts` and pathname parsing. Add route tests for direct load, navigation, refresh, and shared links.
3. Move root layout providers, metadata, icons, fonts, global CSS, and environment variables into the Vite entry and HTML template.
4. Port the service worker. Verify cached shell startup and read-only browsing of cached conversation lists, empty conversations, and message history while offline.
5. Point the Alchemy asset bundle at Vite `dist`, preserve `/api/*` Worker routes, and reduce the asset fallback to SPA navigation requests.
6. Run browser timing probes against both direct Worker URLs and the production asset origin. Confirm generation continues after navigation and reconnects on return.
7. Remove Next, its Serwist adapter, Next mocks/configuration, and obsolete Worker asset-path compatibility code.

## Exit criteria

- Direct navigation and refresh work for `/chat/:sessionId` without query or pathname compatibility code.
- Search parameters are schema-validated and round-trip through back/forward navigation.
- Offline shell and cached read-only conversations work.
- Streaming timing remains progressive through the production Worker origin.
- Chat, tool loop, generation persistence, resume, and threading tests pass.
- No Next package, import, build output, or Worker-specific Next asset mapping remains.

## References

- [TanStack Router overview](https://tanstack.com/router/latest/docs/framework/react)
- [TanStack Router with Vite](https://tanstack.com/router/v1/docs/installation/with-vite)
- [TanStack Router production deployment](https://tanstack.com/router/latest/docs/how-to/deploy-to-production)
