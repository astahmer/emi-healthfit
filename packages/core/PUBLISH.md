# Publishing `@emi/core`

Still **private** in the workspace (`"private": true`). When ready to publish:

1. Bump `version` in `package.json`.
2. Set `"private": false`.
3. Ensure `files` only includes build artifacts you intend to ship (today consumers
   resolve TypeScript sources via workspace; for npm, compile or publish `src`
   with `"types"` / `"exports"` pointed at emitted `.js` + `.d.ts`).
4. Dry-run: `pnpm --filter @emi/core exec npm publish --dry-run`
5. Real publish (needs npm auth): `pnpm --filter @emi/core publish --access public`

Do **not** publish until exports are dual-built for Node consumers outside this monorepo.
