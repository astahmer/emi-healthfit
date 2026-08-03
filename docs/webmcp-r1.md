# WebMCP R1 rollout

WebMCP stays a progressive enhancement. A build must set `VITE_WEBMCP_ENABLED=true`, and the page
must expose `document.modelContext`; either condition being false leaves the normal chat path
unchanged.

## Deployment contract

The Worker and local Vite servers send these WebMCP-relevant headers:

- `Origin-Agent-Cluster: ?1` keeps the document in an origin-isolated agent cluster. Do not send
  `Origin-Agent-Cluster: ?0` or enable `document.domain` on a WebMCP page.
- `Permissions-Policy: ... tools=(self)` explicitly permits top-level and same-origin tool
  registration while denying cross-origin iframe registration.
- `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` keep the phase-one page out of iframes.

The adapter does not set `exposedTo`, and no iframe uses `allow="tools"`. Cross-origin tool sharing
is a separate security review, not an R1 deployment mode.

## Rollout decision

1. Local development: use Chrome's WebMCP testing flag and `VITE_WEBMCP_ENABLED=true`.
2. Staging: obtain an origin-trial token for the exact staging origin, deliver it as an
   `Origin-Trial` response header, and enable the build flag only on staging. Keep staging
   authenticated with test data.
3. Production: do not add an origin-trial token or enable the build flag until the staging
   checklist below passes. After the trial or stable Chrome support is confirmed, enable it through
   the same build flag with a reversible release change.

Origin-trial tokens are origin-bound and time-limited; they belong in deployment configuration,
not source, fixtures, or client-visible settings files.

## Verification checklist

- [x] Deterministic Playwright harness discovers exactly the safe allowlist and executes context,
      theme, memory search, and visible draft filling.
- [x] Generic E2E covers suggestions, web search, and Google/social sign-in independently of
      WebMCP.
- [x] Automated responses assert `Origin-Agent-Cluster: ?1` and `tools=(self)`.
- [ ] In Chrome, visit `chrome://flags/#enable-webmcp-testing` on a local build, open the page,
      inspect the WebMCP tools in the Model Context Tool Inspector, and execute one read-only and
      one visible state-changing tool.
- [ ] In staging, inspect the document response for the expected `Origin-Trial`, origin-cluster,
      and permissions headers; confirm discovery is absent on an unflagged/non-trial browser.
- [ ] Confirm the page is not available as a cross-origin iframe and that no tool is visible from
      an unrelated origin.

The real-Chrome checklist remains manual because the repository harness supplies a deterministic
`document.modelContext` test double; it cannot prove Chrome's native discovery implementation.

## `apps/chat` integration boundary

`apps/chat` keeps its existing XState machines and React providers as the sole owners of HealthFit
session, conversation, settings, and persistence state. It must not instantiate a second generic
`createChatRuntime` just to expose WebMCP.

When the main app opts in, it should call `createWebMcpRegistration` from `@emi/core/runtime` once
at the chat route boundary and pass a thin adapter whose getters and commands delegate to the
existing actors. The adapter projects only the read-only `WebMcpState` contract; it must not cache
conversation, memory, auth, or transport state. Pass an explicit `toolNames` allowlist for the
HealthFit route so query tools are not registered before its query actors expose typed commands.
Start and stop the registration with the route/provider lifecycle, and give it the same
`WebMcp.detect(document)` capability used by the generic fixture.

R1 app allowlist is intentionally limited to capabilities that the current app can delegate
without inventing state: context, opening an existing conversation, starting a new chat, theme,
and visible composer draft. Conversation search and memory search remain disabled for `apps/chat`
until its existing query actors expose typed commands/subscriptions; generic core remains the
reference implementation for the complete seven-tool allowlist.
