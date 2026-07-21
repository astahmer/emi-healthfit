# Publishing `@emi/create-chat-app`

Still **private** (`"private": true`). When ready:

1. Bump `version`.
2. Set `"private": false`.
3. Ensure the `bin` entry points at a Node-runnable file (strip-types or compiled).
4. Dry-run: `pnpm --filter @emi/create-chat-app exec npm publish --dry-run`
5. Publish: `pnpm --filter @emi/create-chat-app publish --access public`
