# Ignored or externally owned papercuts

These prior cuts do not belong in EMI HealthFit source. Workarounds remain documented so future
sessions do not repeat them.

| Papercut                                                                     | Disposition                                | Workaround                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `ast-outline show` gives no nearby Markdown headings after a miss            | External `ast-outline` UX                  | Run `rtk ast-outline <file>` once and copy the exact heading.                                                                  |
| `ast-outline digest` aborts when one requested path is absent                | External `ast-outline` error handling      | Inventory with `rtk rg --files` first and pass only existing paths. This repository uses `apps/chat/app`, not `apps/chat/src`. |
| `.references/effect` may be absent                                           | Fixed in repository guidance               | `AGENTS.md` now points to the pinned installed Effect source as the fallback.                                                  |
| Compact outline hid exact multiline text needed by `apply_patch`             | Expected compact-outline tradeoff          | Use `rtk ast-outline show <file> <symbol>` before patching the body.                                                           |
| Effect reference advice did not match installed Effect v4 modules            | Fixed in repository guidance               | Confirm the installed major and use `apps/api/node_modules/effect`; do not assume `effect/FiberRef` exists.                    |
| `rtk pnpm` can mis-handle filters or dispatch root `typecheck` as bare `tsc` | External RTK wrapper behavior              | Use `rtk pnpm --dir apps/api <script>` / `rtk pnpm --dir apps/chat <script>`, or `rtk pnpm -r typecheck`.                      |
| Root-level `alchemy.run.ts` was assumed during inventory                     | Not relevant after repository map is known | Alchemy entrypoint is `apps/api/alchemy.run.ts`; use that path directly.                                                       |
