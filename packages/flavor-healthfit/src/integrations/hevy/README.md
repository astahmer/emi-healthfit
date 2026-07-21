# Hevy provider client

Typed HTTP client for the [Hevy public API](https://api.hevyapp.com/docs/).

## Layout

| Path                              | Purpose                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `openapi/hevy.openapi.json`       | Vendored OpenAPI snapshot (Hevy has no public `openapi.json` URL) |
| `generated/hevy-api.generated.ts` | `typed-openapi` types-only client                                 |
| `hevy-client.ts`                  | Effect wrapper (`api-key`, spans, tagged errors)                  |

## Regen

```bash
pnpm --filter @emi/api hevy:openapi              # writes openapi/hevy.openapi.json here
pnpm --filter @emi/flavor-healthfit hevy:client  # regenerate typed client (or: pnpm --filter @emi/api hevy:client)
```

Canonical OpenAPI + generated client live only in this package. `apps/api` keeps
thin TypeScript re-exports and delegates `hevy:client` here.

## Sync (Workers Free)

Shipped paths: connect + initial import, Settings **Sync now**, stale-on-demand
(15 min) on workouts list, analytics overview, recovery, summary, and chat start.
No Cron Trigger — Free Cron CPU is 10ms.

See [SCHEDULING.md](./SCHEDULING.md) for the Workers Paid twice-daily cron upgrade.

## Live smoke (optional)

```bash
# In repo-root .env (or export):
# HEVY_API_KEY=<Hevy Pro developer key>
# HEVY_CREDENTIAL_ENCRYPTION_KEY=<optional; ephemeral key used if unset>
pnpm --filter @emi/api test:file test/hevy-live.integration.test.ts
```

Skipped when `HEVY_API_KEY` is unset.

## Secrets / agent setup

| Variable                         | Where                                                     | Purpose                                                         |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| `HEVY_CREDENTIAL_ENCRYPTION_KEY` | `.env`, `.env.prod`, Worker via Alchemy `Config.redacted` | AES-GCM key for per-user Hevy API keys (32 bytes hex or base64) |
| `HEVY_API_KEY`                   | local `.env` only (optional)                              | Live sync smoke test against Hevy                               |

**Clone / existing `.env` without the key:**

```bash
pnpm --filter @emi/api setup:hevy-key
# or: openssl rand -hex 32  → paste into HEVY_CREDENTIAL_ENCRYPTION_KEY=
```

`pnpm setup:google` generates the encryption key on first `.env` create. Redeploy after changing
`.env.prod` so Alchemy rebinds the Worker secret.

## TODO

Regenerate with `typed-openapi --runtime effect` once Effect Schema runtime is
published — see `typedapi` repo `plans/effect-schema-runtime.md`. Until then,
responses are types-only (no runtime Schema.decode).
