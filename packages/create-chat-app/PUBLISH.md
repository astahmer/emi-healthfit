# Publishing `@emi/create-chat-app`

**Default: do not publish.** Scaffolding inside this monorepo uses the workspace package.
A private Discord bot / HealthFit deploy does **not** need npm.

Publish only to offer `create-chat-app` as a public CLI on the registry. Until then keep
`"private": true`.

If/when releasing externally:

1. Bump `version`.
2. Set `"private": false`.
3. Ensure the `bin` entry points at a Node-runnable file (strip-types or compiled).
4. Dry-run: `pnpm --filter @emi/create-chat-app exec npm publish --dry-run`
5. Publish: `pnpm --filter @emi/create-chat-app publish --access public`

The published CLI must keep both entry points working:

- `create-chat-app <name>` creates a generated workspace.
- `create-chat-app upgrade <directory>` reads `emi.generated.json` and never overwrites modified
  generated files without an explicit `--force`.
