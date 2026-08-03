# @emi/create-chat-app

Scaffolder for a self-hostable, full-stack chat starter. By default it generates a Vite + React web
app, an Alchemy Cloudflare Worker with D1 persistence, and the full reusable `@emi/core` source.
Everything is local and editable. Dependency mode remains available for an existing workspace or a
published core package.

## Usage

```bash
# Interactive (prompts for a name if stdin is a TTY)
node --experimental-strip-types bin/create-chat-app.ts

# Non-interactive
node --experimental-strip-types bin/create-chat-app.ts my-chat-app --dir ./out/my-chat-app

# Print the file list without writing anything
node --experimental-strip-types bin/create-chat-app.ts my-chat-app --dry-run

# Use an existing or published @emi/core package instead of copying source
node --experimental-strip-types bin/create-chat-app.ts my-chat-app --mode dependency --core-version "^1.2.0"

# Verify the owned generated application end to end
pnpm test:generated
```

Once published, the same CLI is reachable as `create-chat-app` via the `bin` field.

## Options

| Flag                   | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `-n, --name <name>`    | App name (prompted if omitted and stdin is a TTY)                       |
| `-d, --dir <path>`     | Target directory (default: `./<name>`)                                  |
| `--mode <mode>`        | `owned` (default) copies editable core; `dependency` uses external core |
| `--core-version <ver>` | Dependency version string in dependency mode (default: `workspace:*`)   |
| `--dry-run`            | Print the file list without writing anything                            |
| `--force`              | Overwrite a non-empty target directory                                  |
| `-h, --help`           | Show help text                                                          |

## Generated tree

```text
<target>/
  emi.generated.json    # generator provenance and managed-file hashes
  README.md
  package.json
  pnpm-workspace.yaml
  core/                  # editable @emi/core source and tests
  .env.example
  .gitignore
  web/
    package.json          # depends on @emi/core, ai, react
    src/app.tsx           # working streaming chat + local settings
    src/app.css           # portable responsive starter styling
    ...
  worker/
    package.json          # depends on @emi/core (+ alchemy/drizzle)
    src/generic.worker.ts # D1 conversations + core chat stream/replay routes
    ...
```

## Guardrails

`src/guardrails.ts` hashes fixture-derived app files and scans them for relative imports that reach
into the monorepo. Intentional owned `core/` files are exempt, because they are now part of the
generated project. The fixture script (`pnpm fixture:chat-app`) regenerates an ignored local fixture.

`emi.generated.json` records the app identity, distribution mode, core version, and SHA-256 hash of
each generated file. A future upgrade command can use it to report locally modified files before
changing an owned workspace.

## Deferred

Real npm publishing of `@emi/create-chat-app` and `@emi/core` is out of scope here. The default
owned workspace works without publishing; dependency mode requires a workspace or registry that
can resolve the selected `@emi/core` version.
