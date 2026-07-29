# Ignored or externally owned papercuts

These prior cuts do not belong in EMI HealthFit source. Workarounds remain documented so future
sessions do not repeat them.

| Papercut | Disposition | Workaround |
| --- | --- | --- |
| `ast-outline show` gives no nearby Markdown headings after a miss | External `ast-outline` UX | Run `rtk ast-outline <file>` once and copy the exact heading. |
| `ast-outline digest` aborts when one requested path is absent | External `ast-outline` error handling | Inventory with `rtk rg --files` first and pass only existing paths. This repository uses `apps/chat/app`, not `apps/chat/src`. |
| `ast-outline show` expands unquoted multi-path args like a shell glob | External `ast-outline` UX | Quote each path; prefer one `show` call per file when unsure. |
| `ast-outline` paths are extension-sensitive / batch aborts on one miss | External `ast-outline` UX | Pass the exact extension; discover neighbors with `rg --files` before batching. |
| Unrecognized `ast-outline -g` flags emit a note and skip outlining | External `ast-outline` validation | Use documented flags only (`ast-outline help`); do not invent `-g` filters. |
| `.references/effect` may be absent | Fixed in repository guidance | `AGENTS.md` now points to the pinned installed Effect source as the fallback. |
| Compact outline hid exact multiline text needed by `apply_patch` | Expected compact-outline tradeoff | Use `rtk ast-outline show <file> <symbol>` before patching the body. |
| Effect reference advice did not match installed Effect v4 modules | Fixed in repository guidance | Confirm the installed major and use `apps/api/node_modules/effect`; do not assume `effect/FiberRef` exists. |
| `rtk pnpm` can mis-handle filters or dispatch root `typecheck` as bare `tsc` | External RTK wrapper behavior | Use `rtk pnpm --dir apps/api <script>` / `rtk pnpm --dir apps/chat <script>`, or `rtk pnpm -r typecheck`. |
| Root-level `alchemy.run.ts` was assumed during inventory | Not relevant after repository map is known | Alchemy entrypoint is `apps/api/alchemy.run.ts`; use that path directly. |
| TanStack Router packages live outside `apps/chat/node_modules` | pnpm hoist layout | Resolve from the workspace root `node_modules` / pnpm store; do not assume an app-local path. |
| `web.run` / `functions.exec` returns a non-MCP content shape | External Cursor connector | Read the tool result as a plain object/string envelope; do not assume standard MCP `content[]` iteration. |
| `jj` has no `git diff --check` | External jj CLI | Use `pnpm format` / `pnpm fmt`, or `git diff --check` on the git view. |
