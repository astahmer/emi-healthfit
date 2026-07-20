# Hevy sync scheduling

## Free tier (current)

Workers Free supports Cron Triggers, but each cron invocation has a **10 ms CPU**
limit. Hevy sync (credential decrypt, paginated Hevy HTTP, D1 upserts) cannot
finish in that budget.

**Shipped freshness paths (Free-safe):**

1. Connect → validate key → initial full workout import
2. Manual **Sync now** from Settings
3. Stale-on-demand (`ensureHevyFresh`, 15 minutes) on Hevy-dependent reads

No Cron Trigger is registered for Hevy.

## Paid upgrade (later)

**Plan:** Cloudflare **Workers Paid** (~$5/month).

**Why:** Cron schedules with interval ≥ 1 hour get **15 minutes** of CPU time —
enough to walk connected users and run the shared sync service.

**Suggested schedule:** twice daily UTC

```cron
0 0,12 * * *
```

**Implementation sketch (do not add on Free):**

1. Register the cron on the Api Worker (Alchemy / Wrangler `triggers.crons`).
2. On `scheduled`, list users with a Hevy connection.
3. For each user, call the same `syncHevy` / lease path used by manual sync
   (force or respect a daily interval). Coalesce with in-flight leases.
4. Never fork a second sync implementation; never log API keys or provider bodies.

See also [`plans/hevy-api-sync.md`](../../../../../plans/hevy-api-sync.md)
§ Scheduling / free tier.
