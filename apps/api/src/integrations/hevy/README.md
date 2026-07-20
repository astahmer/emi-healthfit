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
pnpm --filter @emi/api hevy:openapi   # re-fetch + normalize OAS
pnpm --filter @emi/api hevy:client    # regenerate typed client
```

Hevy embeds the spec in `swagger-ui-init.js`. The fetch script also rewrites
non-standard `{ "type": "enum", ... }` schemas to `{ "type": "string", "enum": ... }`
so typed-openapi can generate.

## Sync (Workers Free)

Shipped paths: connect + initial import, Settings **Sync now**, stale-on-demand
(15 min) on workout list. No Cron Trigger — Free Cron CPU is 10ms.

See [SCHEDULING.md](./SCHEDULING.md) for the Workers Paid twice-daily cron upgrade.

Worker secret: `HEVY_CREDENTIAL_ENCRYPTION_KEY` (32-byte hex or base64).

## TODO

Regenerate with `typed-openapi --runtime effect` once Effect Schema runtime is
published — see `typedapi` repo `plans/effect-schema-runtime.md`. Until then,
responses are types-only (no runtime Schema.decode).
