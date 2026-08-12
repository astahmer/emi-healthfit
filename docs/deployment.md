# Deploying a generic chat application

The canonical no-flavor stack is `apps/generic-web` plus `apps/generic-worker`. It uses Vite,
Alchemy, Cloudflare Worker, D1, anonymous session auth, and the generic route factories from
`@emi/core/cloudflare`.

## Local verification

Install the workspace, then run the deterministic checks:

```sh
pnpm install
pnpm --dir apps/generic-web typecheck
pnpm --dir apps/generic-web test:api
pnpm --dir apps/generic-web test:e2e
```

For a live local Worker and Vite proxy, use `pnpm generic:dev`. The fixed ports are web `3233` and
Worker `8787`. API responses must remain JSON and the Worker must trust the web origin in
`BETTER_AUTH_URL`.

## Generated owned app

Create an editable full-stack app from the canonical fixture:

```sh
node --experimental-strip-types bin/create-chat-app.ts my-chat --dir ./my-chat
pnpm --dir ./my-chat install
pnpm --dir ./my-chat test:generated
```

The default `owned` mode copies core source into `core/`, web composition into `web/`, and Worker
composition plus migrations into `worker/`. It records `emi.generated.json` with source hashes.
`create-chat-app upgrade` updates only unchanged generated files, reports conflicts, and requires
explicit `--force` before replacing a user-modified file.

## Alchemy deployment

Generated applications deploy their own Worker and D1 database. Run the generated migration check,
then deploy with the app's environment file:

```sh
pnpm --dir worker db:generate
pnpm --dir worker db:check
pnpm --dir worker deploy --env-file ../.env
```

Alchemy is the deployment authority. Do not apply migrations or deploy the Worker with Wrangler.
Keep `BETTER_AUTH_URL` equal to the exact public origin and use separate secrets per stage. The
generic scaffold has no HealthFit credentials, prompts, routes, or UI imports.

The HealthFit repository keeps Alchemy as a workspace dependency. Run `pnpm alchemy:login` (or bare
`alchemy login` inside the Nix/direnv shell) to configure or replace Cloudflare credentials. Raw
`pnpm exec alchemy login` only refreshes an existing profile and can report an OAuth refresh failure
when its stored token has expired.

Before a release, run the repository gate once after the final code change:

```sh
pnpm release:check
```
