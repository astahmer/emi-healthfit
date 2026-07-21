import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const loadEnvFile = async (path: string): Promise<Record<string, string>> => {
  try {
    const text = await readFile(path, "utf8");
    const values: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator);
      let value = trimmed.slice(separator + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
};

const requiredKeys = ["DISCORD_PUBLIC_KEY", "DISCORD_APPLICATION_ID", "DISCORD_BOT_TOKEN"] as const;

describe("discord-bot setup check", () => {
  it("has Discord secrets in .env or process env", async () => {
    const fileEnv = await loadEnvFile(join(appRoot, ".env"));
    const missing = requiredKeys.filter((key) => {
      const value = process.env[key] ?? fileEnv[key];
      return value === undefined || value.trim() === "";
    });
    assert.deepEqual(
      missing,
      [],
      `Missing Discord secrets: ${missing.join(", ")}. See plans/discord-bot.md Zero→smoke.`,
    );
  });

  it("documents Alchemy adopt (not plain deploy) for first GymData bind", async () => {
    const packageJson = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    assert.equal(packageJson.scripts?.["deploy:adopt"], "alchemy deploy --adopt");
    assert.equal(packageJson.scripts?.["dry:adopt"], "alchemy deploy --dry-run --adopt");
  });
});
