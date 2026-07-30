# @emi/create-chat-app

Scaffolder for a self-hostable, full-stack chat starter in workspace composition mode. It generates
a Vite + React web app with browser-local BYOK settings, streaming, temporary chats, stop, and new
chat controls; plus an Alchemy Cloudflare Worker with D1 conversations, durable generation chunks,
and a resume endpoint. Both packages depend on the single `@emi/core` package. **No core package
source is copied** — generated files only use its public subpath exports.

## Usage

```bash
# Interactive (prompts for a name if stdin is a TTY)
node --experimental-strip-types bin/create-chat-app.ts

# Non-interactive
node --experimental-strip-types bin/create-chat-app.ts my-chat-app --dir ./out/my-chat-app

# Print the file list without writing anything
node --experimental-strip-types bin/create-chat-app.ts my-chat-app --dry-run

# Pin a released core version instead of the workspace protocol
node --experimental-strip-types bin/create-chat-app.ts my-chat-app --core-version "^1.2.0"
```

Once published, the same CLI is reachable as `create-chat-app` via the `bin` field.

## Options

| Flag                   | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `-n, --name <name>`    | App name (prompted if omitted and stdin is a TTY)                  |
| `-d, --dir <path>`     | Target directory (default: `./<name>`)                             |
| `--core-version <ver>` | Dependency version string for `@emi/core` (default: `workspace:*`) |
| `--dry-run`            | Print the file list without writing anything                       |
| `--force`              | Overwrite a non-empty target directory                             |
| `-h, --help`           | Show help text                                                     |

## Generated tree

```text
<target>/
  README.md
  .env.example
  .gitignore
  web/
    package.json          # depends on @emi/core, ai, react
    src/app.tsx           # working streaming chat + local settings
    src/app.css           # portable responsive starter styling
    ...
  worker/
    package.json          # depends on @emi/core (+ alchemy/drizzle)
    src/app.worker.ts     # D1 conversations + core chat stream/replay routes
    ...
```

## Guardrails

`src/guardrails.ts` hashes every file under `packages/core/src/{contract,server,web,cloudflare,discord}`
and scans for relative imports that reach into the monorepo. The fixture script
(`pnpm fixture:chat-app`) regenerates `apps/generated-fixture/{web,worker}` and re-runs that scan.

## Deferred

Real npm publishing of `@emi/create-chat-app` and `@emi/core` is out of scope here. Until then,
`workspace:*` only resolves inside a pnpm workspace that also contains those packages. The planned
owned-source mode is not implemented yet; do not treat this workspace mode as the final
shadcn-style distribution path.
