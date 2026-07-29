# Hevy integration (agent notes)

## Required env

```bash
# 32-byte key (hex shown). Never commit real values.
HEVY_CREDENTIAL_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

- Declared on the Api Worker as `Config.redacted("HEVY_CREDENTIAL_ENCRYPTION_KEY")`.
- Fresh clone with existing `.env`: `pnpm --filter @emi/api setup:hevy-key`
- Fresh Google setup: `pnpm setup:google -- …` already writes the key.
- See also `.env.example` and `apps/api/src/integrations/hevy/README.md`.

## Optional live test

```bash
# Hevy Pro developer key from https://hevy.com/settings?developer
export HEVY_API_KEY=…
# Uses HEVY_CREDENTIAL_ENCRYPTION_KEY from .env or generates an ephemeral test key
pnpm --filter @emi/api test:file test/hevy-live.integration.test.ts
```

Skipped automatically when `HEVY_API_KEY` is unset.

## Free tier

No Cloudflare Cron. Freshness = connect + Sync now + stale-on-demand (15m).
Paid upgrade for twice-daily cron: `apps/api/src/integrations/hevy/SCHEDULING.md`.
