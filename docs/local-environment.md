# Local environment

Keep secrets in the smallest environment file that consumes them. The files are ignored by Git;
the checked-in examples contain names and safe placeholders only.

## File ownership

| File                       | Used by                                               | Required values                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env`                     | HealthFit API local dev, dry runs, and `dev:portless` | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `HEVY_CREDENTIAL_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `DISCORD_INTERNAL_ASK_SECRET` |
| `.env.prod`                | Production deploy/release verification                | The eight API values above plus `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`                                                                                                       |
| `apps/discord-bot/.env`    | Discord Worker dev/deploy and command registration    | `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`, optional `DISCORD_GUILD_ID`, `EMI_API_BASE_URL`, `DISCORD_INTERNAL_ASK_SECRET`                                      |
| `apps/generic-worker/.env` | Optional standalone generic Worker dev                | Copy `apps/generic-worker/.env.example`; `pnpm generic:dev` creates a temporary file from only `BETTER_AUTH_SECRET` instead                                                              |

Do not copy the HealthFit `.env` into an app directory. API package scripts explicitly load the root
file, and the generic launcher filters its temporary file so unrelated HealthFit secrets do not reach
the generic Worker. `HEVY_API_KEY`, `D1_DATABASE_ID`, and Cloudflare credentials for one-off commands
are not normal local runtime values.

`BETTER_AUTH_URL` is the public browser origin for the mode being run. The API-only and built-SPA
commands use the value from `.env`; `pnpm chat:dev` creates a temporary API environment with the
Vite origin instead, so OAuth state cookies and `/chat` redirects stay on the hot-reload UI.

## Create or generate values

For a manual setup:

```bash
cp .env.example .env
openssl rand -base64 32
openssl rand -hex 32
```

Use the first value for `BETTER_AUTH_SECRET` and the second for
`HEVY_CREDENTIAL_ENCRYPTION_KEY`. Keep the two values separate.

The recommended Google setup imports the downloaded web-client JSON, generates both random values,
and writes the root file with owner-only permissions:

```bash
pnpm setup:google -- ~/Downloads/client_secret_....json you@example.com
```

The Google client comes from [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients).
Register the callback matching the URL you use:

- Fixed API: `http://localhost:1337/api/auth/callback/google`
- Fixed chat UI: `http://127.0.0.1:3232/api/auth/callback/google`
- Portless API: `https://emi-healthfit.localhost/api/auth/callback/google`
- Portless chat UI: `https://emi-chat.localhost/api/auth/callback/google`

Register both when switching between modes. If `.env` already exists, add the Hevy encryption key
with `pnpm --filter @emi/api setup:hevy-key` instead of rerunning Google setup.

Get `OPENAI_API_KEY` from [OpenAI API keys](https://platform.openai.com/api-keys). Generate
`DISCORD_INTERNAL_ASK_SECRET` with `openssl rand -base64 32`, then put the matching value in the
root API file and `apps/discord-bot/.env`. Discord application values come from the
[Discord Developer Portal](https://discord.com/developers/applications): Public Key, Application ID,
and Bot Token. Put the API origin in `EMI_API_BASE_URL`; use the same local or production origin that
the bot should call. Use `DISCORD_GUILD_ID` only for fast guild command registration; omit it for
global commands.

`CLOUDFLARE_ACCOUNT_ID` is in the Cloudflare dashboard account URL. Create a narrowly scoped API
token in the Cloudflare API Tokens page, or use `alchemy login` and omit those values when the command
does not need Wrangler API access. Keep them in `.env.prod` only when using the release verification
or documented operational commands that load that file.

For a live Hevy smoke test, keep the Pro key out of `.env` and pass it for that command only:

```bash
HEVY_API_KEY=... pnpm --filter @emi/api test:file test/hevy-live.integration.test.ts
```

## Named local URLs

Portless is the preferred human-facing development path:

```bash
pnpm portless:doctor
pnpm dev:portless
```

The HealthFit Worker is at `https://emi-healthfit.localhost`. For the generic fixture, use
`pnpm generic:dev:portless`; it exposes `https://generic-chat.localhost` and
`https://generic-worker.localhost`. For chat UI hot reload, run `pnpm chat:dev:portless` after the
HealthFit Portless API is running; the UI and OAuth origin are at `https://emi-chat.localhost/chat`.

The first Portless run may need `pnpm exec portless trust`. Fixed-port commands remain the
deterministic choice for Playwright and generated-app acceptance.
