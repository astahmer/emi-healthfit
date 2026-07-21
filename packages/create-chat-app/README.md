# @emi/create-chat-app

Scaffolder for a thin, self-hostable chat-app composition root. Generates a `web/` (Vite + React,
imports `@emi/core/web` + `@emi/core/contract`) and a `worker/` (Alchemy Cloudflare Worker,
imports `@emi/core/server` + `@emi/core/cloudflare`) pair of packages. Both depend on the single
`@emi/core` package. **No core package source is ever copied** — generated files only reference
`@emi/core` by package name and use subpath imports.

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
    package.json          # depends on @emi/core (+ react)
    src/app.tsx           # CoreWebProvider + ChatShell
    ...
  worker/
    package.json          # depends on @emi/core (+ alchemy/drizzle)
    src/app.worker.ts     # coreAppDefinition + D1 conversation routes
    ...
```

## Guardrails

`src/guardrails.ts` hashes every file under `packages/core/src/{contract,server,web,cloudflare,discord}`
and scans for relative imports that reach into the monorepo. The fixture script
(`pnpm fixture:chat-app`) regenerates `apps/generated-fixture/{web,worker}` and re-runs that scan.

## Deferred

Real npm publishing of `@emi/create-chat-app` and `@emi/core` is out of scope here.
Until then, `workspace:*` only resolves inside a pnpm workspace that also contains those packages.
