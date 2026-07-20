import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { makeSqliteDatabase, run } from "./sqlite.ts";
import {
  connectHevy,
  getHevyIntegrationStatus,
  syncHevy,
} from "../src/integrations/hevy/hevy-sync.ts";

const loadRepoDotEnv = () => {
  const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
};

loadRepoDotEnv();

const hevyApiKey = process.env.HEVY_API_KEY?.trim() ?? "";
const encryptionKey =
  process.env.HEVY_CREDENTIAL_ENCRYPTION_KEY?.trim() || randomBytes(32).toString("hex");

describe("Hevy live sync smoke", () => {
  it(
    "connects with a real API key and syncs into sqlite",
    { skip: hevyApiKey === "" ? "Set HEVY_API_KEY to run live Hevy smoke" : false },
    async () => {
      const { db } = makeSqliteDatabase();
      const environment = { HEVY_CREDENTIAL_ENCRYPTION_KEY: encryptionKey };
      const userId = "hevy-live-smoke";

      const connected = await run(
        connectHevy({
          db,
          userId,
          apiKey: hevyApiKey,
          environment,
        }),
      );
      assert.ok(connected.mode === "initial" || connected.mode === "skipped_busy");
      assert.equal(connected.lastErrorCode, null);

      const forced = await run(syncHevy({ db, userId, environment, force: true }));
      assert.ok(
        forced.mode === "initial" ||
          forced.mode === "incremental" ||
          forced.mode === "skipped_fresh" ||
          forced.mode === "skipped_busy",
      );
      assert.equal(forced.lastErrorCode, null);

      const status = await run(getHevyIntegrationStatus({ db, userId }));
      assert.equal(status.connected, true);
      assert.ok(status.lastSuccessAt !== null || connected.mode === "skipped_busy");

      const kysely = await run(db.kysely);
      const sessions = await kysely
        .selectFrom("hevy_sessions")
        .selectAll()
        .where("user_id", "=", userId)
        .execute();
      assert.ok(Array.isArray(sessions));
    },
  );
});
