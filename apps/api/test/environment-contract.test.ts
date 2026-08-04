import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

const environmentKeys = async (path: string) => {
  const contents = await readFile(path, "utf8");
  return contents
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")));
};

const assertEnvironmentKeys = async ({
  relativePath,
  expectedKeys,
}: {
  relativePath: string;
  expectedKeys: string[];
}) => {
  const actualKeys = await environmentKeys(resolve(workspaceRoot, relativePath));
  assert.deepEqual(actualKeys, expectedKeys, `${relativePath} environment contract changed`);
};

describe("environment file contracts", () => {
  it("keeps each example scoped to its consuming app", async () => {
    await assertEnvironmentKeys({
      relativePath: ".env.example",
      expectedKeys: [
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "ALLOWED_EMAILS",
        "HEVY_CREDENTIAL_ENCRYPTION_KEY",
        "OPENAI_API_KEY",
        "DISCORD_INTERNAL_ASK_SECRET",
      ],
    });
    await assertEnvironmentKeys({
      relativePath: "apps/generic-worker/.env.example",
      expectedKeys: [
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "AUTH_APP_NAME",
        "ALLOW_DEMO_USER_HEADER",
      ],
    });
    await assertEnvironmentKeys({
      relativePath: "apps/discord-bot/.env.example",
      expectedKeys: [
        "DISCORD_PUBLIC_KEY",
        "DISCORD_APPLICATION_ID",
        "DISCORD_BOT_TOKEN",
        "DISCORD_GUILD_ID",
        "EMI_API_BASE_URL",
        "DISCORD_INTERNAL_ASK_SECRET",
      ],
    });
  });

  it("loads the API package from the root environment file", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(workspaceRoot, "apps/api/package.json"), "utf8"),
    );
    assert.equal(packageJson.scripts.dev, "pnpm run alchemy dev --env-file ../../.env");
    assert.equal(
      packageJson.scripts.dry,
      "pnpm run alchemy deploy --dry-run --env-file ../../.env",
    );
    assert.equal(packageJson.scripts.deploy, "pnpm run alchemy deploy --env-file ../../.env");
  });
});
