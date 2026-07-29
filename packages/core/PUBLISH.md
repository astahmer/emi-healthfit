# Publishing `@emi/core`

**Default: do not publish.** This monorepo (HealthFit chat, API, Discord bot, flavors)
consumes `@emi/core` via the pnpm workspace. Private apps and the Discord bot never need
the npm registry.

Publish only if you intentionally want **external** consumers (other repos / public CLI
templates) to install `@emi/core` from npm. Until then keep `"private": true`.

Still **private** in the workspace. If/when releasing externally:

1. Bump `version` in `package.json`.
2. Set `"private": false`.
3. Ensure `files` only includes build artifacts you intend to ship (today consumers
   resolve TypeScript sources via workspace; for npm, compile or publish `src`
   with `"types"` / `"exports"` pointed at emitted `.js` + `.d.ts`).
4. Dry-run: `pnpm --filter @emi/core exec npm publish --dry-run`
5. Real publish (needs npm auth): `pnpm --filter @emi/core publish --access public`

Do **not** publish until exports are dual-built for Node consumers outside this monorepo.
