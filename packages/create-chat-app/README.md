# @emi/create-chat-app

Scaffolder for a thin, self-hostable chat-app composition root. Generates a `web/` (Vite + React,
depends on `@emi/core-web` + `@emi/core-contract`) and a `worker/` (Alchemy Cloudflare Worker,
depends on `@emi/core-server` + `@emi/platform-cloudflare`) pair of packages. **No core package
source is ever copied** — generated files only reference `@emi/core-*` and
`@emi/platform-cloudflare` by package name.

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

| Flag                   | Description                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `-n, --name <name>`    | App name (prompted if omitted and stdin is a TTY)                             |
| `-d, --dir <path>`     | Target directory (default: `./<name>`)                                        |
| `--core-version <ver>` | Dependency version string for `@emi/core-*` packages (default: `workspace:*`) |
| `--dry-run`            | Print the file list without writing anything                                  |
| `--force`              | Overwrite a non-empty target directory                                        |
| `-h, --help`           | Show help text                                                                |

## Generated tree

```text
<target>/
  README.md            states application logic comes from @emi/core-* packages
  .env.example
  .gitignore
  web/                  Vite + React composition root (mirrors apps/generic-web)
  worker/               Alchemy Cloudflare Worker composition root (mirrors apps/generic-worker)
```

`web/` and `worker/` must be members of a pnpm workspace that also resolves the `@emi/core-*`
packages — either this monorepo (when generated under `apps/`) or, once released, a standalone
project's own workspace pinned to a published version via `--core-version`.

## Tests

- `test/generate.test.ts` — unit: exact generated file set, `@emi/*` dependency names/versions.
- `test/boundary.test.ts` — guardrail: hashes generated files against every file under
  `packages/core-*/src` and `packages/platform-cloudflare/src` and scans for relative imports that
  reach into those directories.
- `test/upgrade.test.ts` — bumping `--core-version` changes only the version string; package names
  stay stable.
- `test/cli.test.ts` — flag parsing, plus an end-to-end run into a real temp directory asserting
  `typecheck` scripts exist (running `tsc` itself requires `pnpm install` first, see
  `scripts/generate-chat-app-fixture.mjs` at the repo root).

## Deferred

Real npm publishing of `@emi/create-chat-app` and the `@emi/core-*` packages is out of scope here.
Until that happens, `workspace:*` (the default `--core-version`) only resolves inside a pnpm
workspace that also contains those packages.
