## features idea

- "side chat" with /btw? (or a button etc) ? -> not a branch; it should use the current history; that allows asking a question that will NOT be persisted and it should be displayed on the side. kinda like codex /side has

- we dont have enough E2E tests; lets ensure EVERY possible chat scenarios are covered (see what's possible with our machines + our current features). maybe these could help:
  -- https://stately.ai/docs/xstate-test so that we test all our possible machine states and transitions
  -- https://github.com/vitalets/playwright-bdd so that we can write BDD tests for our app (like "Given a user is on the chat page, when they click on the suggestions, then the message should be sent and displayed in the chat")

→ split & describe your work with jj revisions; dont use subagents

---

## release

A — Alchemy (you deploy)

Plain alchemy deploy not first-time safe for GymData. Use pnpm discord:deploy:adopt. Step-by-step in plans/discord-bot.md (guild + Discord app + secrets +
pnpm discord:setup:check). Agent can check secrets; you still make the Discord server/app.

1. Make test Discord guild + app; fill apps/discord-bot/.env (see .env.example: add EMI_API_BASE_URL, DISCORD_INTERNAL_ASK_SECRET)
2. Same ask secret + OPENAI_API_KEY on API .env / Alchemy
3. pnpm discord:setup:check → pnpm discord:deploy:adopt → paste Interactions URL → pnpm discord:register

---

- dont use subagents; do it all here.
- as usual split & describe your work with jj revisions. add a lot of tests unit/integration/e2e.
