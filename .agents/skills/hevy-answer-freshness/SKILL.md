---
name: hevy-answer-freshness
description: Keep Hevy-backed personalized answers fresh in HealthFit chat and Discord while preserving stale-readable behavior for ordinary dashboards.
---

# Hevy Answer Freshness

Use when adding or changing any generated personalized answer path that reads
Hevy workouts, including chat and Discord commands.

## Choose the right freshness contract

- Generated or personalized answers must require a fresh sync before building
  model context. Use `requireHevyFresh`; do not serve cached workout rows when
  sync fails, is still busy, or returns a provider error.
- Dashboard and ordinary read endpoints may use `ensureHevyFresh` when their
  contract explicitly permits showing cached data after a failed refresh.
- Do not replace a strict answer preflight with a best-effort refresh or a broad
  catch that turns sync failure into success.

## Cover every answer route

1. Inspect current routes and identify every generated answer that depends on
   Hevy data. Check chat, Discord ask/summary/workout/recovery commands, and any
   newly added consumer.
2. Run the strict freshness preflight before constructing personalized model
   context or invoking the model.
3. Preserve typed failure behavior for disconnected, failed, and busy syncs.
   A freshness failure must stop generation rather than quietly using stale
   rows. Do not assume a recent sync timestamp makes an answer current.
4. Keep ordinary dashboard behavior separate; a stale-readable fallback there
   does not authorize stale generated answers.

## Regression evidence

Cover provider failure, a recently timestamped cache, a busy sync lease, stale
rows, and the no-model-call path. Verify each generated consumer, including
Discord routes. Use current focused tests and the release guidance in the repo's
`AGENTS.md`; report code/test evidence separately from production deployment.
