import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  encryptHevyApiKey,
  resolveHevyEncryptionKey,
} from "../src/integrations/hevy/credential-crypto.ts";
import { createHevyClient } from "../src/integrations/hevy/hevy-client.ts";
import { mapHevyWorkoutToRows } from "../src/integrations/hevy/map-workout.ts";

const WORKOUT_PAGE_SIZE = 10;
const SESSION_INSERT_BATCH_SIZE = 8;
const SET_INSERT_BATCH_SIZE = 6;
const MIGRATION_NAME = "20260720151905_real_carmella_unuscione.sql";

const Options = Schema.Struct({
  prod: Schema.optional(Schema.Boolean),
});

const DatabaseEntry = Schema.Struct({
  uuid: Schema.String,
  name: Schema.String,
});

const WranglerQueryResult = Schema.Array(
  Schema.Struct({
    results: Schema.optional(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
    success: Schema.optional(Schema.Boolean),
  }),
);

const D1HttpResponse = Schema.Struct({
  success: Schema.Boolean,
  errors: Schema.optional(
    Schema.Array(
      Schema.Struct({
        code: Schema.optional(Schema.Number),
        message: Schema.optional(Schema.String),
      }),
    ),
  ),
  result: Schema.optional(
    Schema.Array(
      Schema.Struct({
        results: Schema.optional(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
        success: Schema.optional(Schema.Boolean),
      }),
    ),
  ),
});

const AlchemyOauthCredentials = Schema.Struct({
  type: Schema.Literal("oauth"),
  access: Schema.String.check(Schema.isMinLength(1)),
  refresh: Schema.String.check(Schema.isMinLength(1)),
  expires: Schema.Number,
  scopes: Schema.optional(Schema.Array(Schema.String)),
});

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const apiRoot = resolve(import.meta.dirname, "..");

const parseOptions = () => {
  const values: Record<string, boolean> = {};
  for (const argument of process.argv.slice(2)) {
    if (argument === "--") continue;
    if (argument === "--prod") {
      values.prod = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return Schema.decodeUnknownSync(Options)(values);
};

const loadEnvironment = ({ prod }: { prod: boolean }) => {
  const environmentPath = resolve(workspaceRoot, prod ? ".env.prod" : ".env");
  if (!existsSync(environmentPath)) {
    throw new Error(`Missing environment file: ${environmentPath}`);
  }
  loadEnvFile(environmentPath);
};

const ALCHEMY_OAUTH_CLIENT_ID = "6d8c2255-0773-45f6-b376-2914632e6f91";
const ALCHEMY_OAUTH_REDIRECT_URI = "http://localhost:9976/auth/callback";
const ALCHEMY_OAUTH_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";

const refreshAlchemyOauth = async ({
  oauthPath,
  credentials,
}: {
  oauthPath: string;
  credentials: typeof AlchemyOauthCredentials.Type;
}) => {
  const response = await fetch(ALCHEMY_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh,
      client_id: ALCHEMY_OAUTH_CLIENT_ID,
      redirect_uri: ALCHEMY_OAUTH_REDIRECT_URI,
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(
      `Alchemy OAuth refresh failed with status ${response.status}. Run: alchemy login`,
    );
  }
  const payload = Schema.decodeUnknownSync(
    Schema.Struct({
      access_token: Schema.String.check(Schema.isMinLength(1)),
      refresh_token: Schema.String.check(Schema.isMinLength(1)),
      expires_in: Schema.Number,
      scope: Schema.optional(Schema.String),
    }),
  )(await response.json());
  const refreshed = {
    type: "oauth" as const,
    access: payload.access_token,
    refresh: payload.refresh_token,
    expires: Date.now() + payload.expires_in * 1000,
    scopes: payload.scope?.split(" ").filter((scope) => scope !== "") ?? credentials.scopes,
  };
  writeFileSync(oauthPath, `${JSON.stringify(refreshed, null, 2)}\n`);
  return refreshed.access;
};

const resolveCloudflareApiToken = async () => {
  const oauthPath = resolve(homedir(), ".alchemy/credentials/default/cf-oauth.json");
  if (existsSync(oauthPath)) {
    const credentials = Schema.decodeUnknownSync(Schema.fromJsonString(AlchemyOauthCredentials))(
      readFileSync(oauthPath, "utf8"),
    );
    if (credentials.expires > Date.now() + 10_000) {
      return { apiToken: credentials.access, source: "alchemy-oauth" as const };
    }
    const apiToken = await refreshAlchemyOauth({ oauthPath, credentials });
    return { apiToken, source: "alchemy-oauth-refresh" as const };
  }

  return {
    apiToken: requiredEnv("CLOUDFLARE_API_TOKEN"),
    source: "env" as const,
  };
};

const requiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
};

const sqlLiteral = (value: string | number | null) => {
  if (value === null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${value.replaceAll("'", "''")}'`;
};

const wranglerJson = (arguments_: string[]): unknown => {
  const output = execFileSync("pnpm", ["exec", "wrangler", ...arguments_], {
    cwd: apiRoot,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(output);
};

const wranglerQuery = ({
  databaseName,
  sql,
}: {
  databaseName: string;
  sql: string;
}): Array<Record<string, unknown>> => {
  const decoded = Schema.decodeUnknownSync(WranglerQueryResult)(
    wranglerJson(["d1", "execute", databaseName, "--remote", "--command", sql, "--json", "--yes"]),
  );
  return decoded.flatMap((entry) => entry.results ?? []);
};

const selectDatabase = ({ prod }: { prod: boolean }) => {
  const databases = Schema.decodeUnknownSync(Schema.Array(DatabaseEntry))(
    wranglerJson(["d1", "list", "--json"]),
  );
  const candidates = databases.filter((database) => /gymdata/i.test(database.name));
  const selected = prod
    ? candidates.find((database) => /-prod-/i.test(database.name))
    : candidates.find((database) => /-dev-/i.test(database.name));
  if (selected === undefined) {
    throw new Error(`No GymData D1 database found for ${prod ? "prod" : "dev"}`);
  }
  return selected;
};

const tableNames = ({ databaseName }: { databaseName: string }) =>
  new Set(
    wranglerQuery({
      databaseName,
      sql: "SELECT name FROM sqlite_master WHERE type = 'table'",
    })
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string"),
  );

const columnNames = ({ databaseName, table }: { databaseName: string; table: string }) =>
  new Set(
    wranglerQuery({
      databaseName,
      sql: `PRAGMA table_info('${table}')`,
    })
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string"),
  );

const d1HttpQuery = async ({
  accountId,
  apiToken,
  databaseId,
  sql,
  params = [],
}: {
  accountId: string;
  apiToken: string;
  databaseId: string;
  sql: string;
  params?: Array<string | number | null>;
}) => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const payload = Schema.decodeUnknownSync(D1HttpResponse)(await response.json());
  if (!response.ok || !payload.success) {
    const message =
      payload.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join("; ") || `D1 query failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload.result?.flatMap((entry) => entry.results ?? []) ?? [];
};

const applyMigrationIfNeeded = async ({
  accountId,
  apiToken,
  databaseId,
  databaseName,
}: {
  accountId: string;
  apiToken: string;
  databaseId: string;
  databaseName: string;
}) => {
  const hevySetColumns = columnNames({ databaseName, table: "hevy_sets" });
  if (hevySetColumns.has("exercise_index") && hevySetColumns.has("exercise_template_id")) {
    console.log("Schema already includes exercise_index/exercise_template_id");
    return;
  }

  const migrationPath = resolve(apiRoot, "migrations", MIGRATION_NAME);
  const statements = readFileSync(migrationPath, "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

  console.log(`Applying ${MIGRATION_NAME} (${statements.length} statements)`);
  for (const statement of statements) {
    await d1HttpQuery({ accountId, apiToken, databaseId, sql: statement });
  }

  const migrationRows = wranglerQuery({
    databaseName,
    sql: `SELECT id, name FROM d1_migrations WHERE name = ${sqlLiteral(MIGRATION_NAME)}`,
  });
  if (migrationRows.length > 0) return;

  const maxIdRow = wranglerQuery({
    databaseName,
    sql: "SELECT id FROM d1_migrations ORDER BY id DESC LIMIT 1",
  })[0];
  const maxId = typeof maxIdRow?.id === "string" ? Number.parseInt(maxIdRow.id, 10) : 0;
  const nextId = String(Number.isFinite(maxId) ? maxId + 1 : 1).padStart(5, "0");
  const appliedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  await d1HttpQuery({
    accountId,
    apiToken,
    databaseId,
    sql: "INSERT INTO d1_migrations (id, name, applied_at) VALUES (?, ?, ?)",
    params: [nextId, MIGRATION_NAME, appliedAt],
  });
  console.log(`Recorded ${MIGRATION_NAME} as ${nextId}`);
};

const fetchAllWorkouts = async ({ apiKey }: { apiKey: string }) => {
  const client = createHevyClient({ apiKey });
  let page = 1;
  let pageCount = 1;
  const workouts = [];
  let newestUpdatedAt: string | null = null;

  while (page <= pageCount) {
    const response = await Effect.runPromise(
      client.listWorkouts({ page, pageSize: WORKOUT_PAGE_SIZE }),
    );
    pageCount = response.page_count ?? page;
    for (const workout of response.workouts ?? []) {
      workouts.push(workout);
      const updatedAt = workout.updated_at ?? workout.created_at;
      if (
        updatedAt !== undefined &&
        (newestUpdatedAt === null || Date.parse(updatedAt) > Date.parse(newestUpdatedAt))
      ) {
        newestUpdatedAt = updatedAt;
      }
    }
    page += 1;
  }

  return { workouts, newestUpdatedAt };
};

const chunk = <T>(values: ReadonlyArray<T>, size: number) => {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
};

const upsertOwnerData = async ({
  accountId,
  apiToken,
  databaseId,
  userId,
  apiKey,
  encryptionKey,
  workouts,
  newestUpdatedAt,
}: {
  accountId: string;
  apiToken: string;
  databaseId: string;
  userId: string;
  apiKey: string;
  encryptionKey: string;
  workouts: Awaited<ReturnType<typeof fetchAllWorkouts>>["workouts"];
  newestUpdatedAt: string | null;
}) => {
  const keyBytes = await Effect.runPromise(
    resolveHevyEncryptionKey({ environment: { HEVY_CREDENTIAL_ENCRYPTION_KEY: encryptionKey } }),
  );
  const envelope = await Effect.runPromise(encryptHevyApiKey({ apiKey, userId, keyBytes }));
  const userInfo = await Effect.runPromise(createHevyClient({ apiKey }).validateConnection());
  const now = new Date().toISOString();

  await d1HttpQuery({
    accountId,
    apiToken,
    databaseId,
    sql: `
INSERT INTO hevy_connections (
  user_id, provider_user_id, encrypted_api_key, encryption_iv, encryption_version, status, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
  provider_user_id = excluded.provider_user_id,
  encrypted_api_key = excluded.encrypted_api_key,
  encryption_iv = excluded.encryption_iv,
  encryption_version = excluded.encryption_version,
  status = excluded.status,
  updated_at = excluded.updated_at
`,
    params: [
      userId,
      userInfo.data?.id ?? null,
      envelope.ciphertext,
      envelope.iv,
      envelope.version,
      "connected",
      now,
      now,
    ],
  });

  await d1HttpQuery({
    accountId,
    apiToken,
    databaseId,
    sql: `
INSERT INTO hevy_sync_state (
  user_id, event_watermark, last_checked_at, last_success_at, last_data_change_at, lease_until, last_error_code, last_error_at
) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
ON CONFLICT(user_id) DO UPDATE SET
  event_watermark = excluded.event_watermark,
  last_checked_at = excluded.last_checked_at,
  last_success_at = excluded.last_success_at,
  last_data_change_at = excluded.last_data_change_at,
  lease_until = NULL,
  last_error_code = NULL,
  last_error_at = NULL
`,
    params: [userId, newestUpdatedAt ?? now, now, now, now],
  });

  await d1HttpQuery({
    accountId,
    apiToken,
    databaseId,
    sql: `
INSERT INTO sync_cursors (user_id, source, last_sync)
VALUES (?, 'hevy', ?)
ON CONFLICT(user_id, source) DO UPDATE SET last_sync = excluded.last_sync
`,
    params: [userId, now],
  });

  const sessions = [];
  const sets = [];
  for (const workout of workouts) {
    const mapped = mapHevyWorkoutToRows(workout);
    if (mapped === null) continue;
    sessions.push(mapped.session);
    sets.push(...mapped.sets);
  }

  for (const batch of chunk(sessions, SESSION_INSERT_BATCH_SIZE)) {
    const valuesSql = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params = batch.flatMap((session) => [
      userId,
      session.session_id,
      session.provider_workout_id,
      session.source_updated_at,
      session.title,
      session.start_time,
      session.end_time,
      session.duration_sec,
      session.total_volume_kg,
    ]);
    await d1HttpQuery({
      accountId,
      apiToken,
      databaseId,
      sql: `
INSERT INTO hevy_sessions (
  user_id, session_id, provider_workout_id, source_updated_at, title, start_time, end_time, duration_sec, total_volume_kg
) VALUES ${valuesSql}
ON CONFLICT(user_id, session_id) DO UPDATE SET
  provider_workout_id = excluded.provider_workout_id,
  source_updated_at = excluded.source_updated_at,
  title = excluded.title,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  duration_sec = excluded.duration_sec,
  total_volume_kg = excluded.total_volume_kg
`,
      params,
    });
  }

  for (const batch of chunk(sets, SET_INSERT_BATCH_SIZE)) {
    const valuesSql = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params = batch.flatMap((set) => [
      userId,
      set.session_id,
      set.exercise_template_id,
      set.exercise_index,
      set.exercise_title,
      set.set_index,
      set.set_type,
      set.weight_kg,
      set.reps,
      set.rpe,
      set.distance_km,
      set.duration_seconds,
      set.exercise_notes,
    ]);
    await d1HttpQuery({
      accountId,
      apiToken,
      databaseId,
      sql: `
INSERT INTO hevy_sets (
  user_id, session_id, exercise_template_id, exercise_index, exercise_title, set_index, set_type, weight_kg, reps, rpe, distance_km, duration_seconds, exercise_notes
) VALUES ${valuesSql}
ON CONFLICT(user_id, session_id, exercise_index, set_index) DO UPDATE SET
  exercise_template_id = excluded.exercise_template_id,
  exercise_title = excluded.exercise_title,
  set_type = excluded.set_type,
  weight_kg = excluded.weight_kg,
  reps = excluded.reps,
  rpe = excluded.rpe,
  distance_km = excluded.distance_km,
  duration_seconds = excluded.duration_seconds,
  exercise_notes = excluded.exercise_notes
`,
      params,
    });
  }

  return { sessions: sessions.length, sets: sets.length };
};

const main = async () => {
  const options = parseOptions();
  const prod = options.prod ?? false;
  loadEnvironment({ prod });

  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const { apiToken, source: tokenSource } = await resolveCloudflareApiToken();
  process.env.CLOUDFLARE_API_TOKEN = apiToken;
  const apiKey = requiredEnv("HEVY_API_KEY");
  const encryptionKey = requiredEnv("HEVY_CREDENTIAL_ENCRYPTION_KEY");
  const database = selectDatabase({ prod });

  console.log(`Target: ${database.name} (${prod ? "prod" : "dev"}) auth=${tokenSource}`);

  const hevyOwners = wranglerQuery({
    databaseName: database.name,
    sql: `
SELECT hs.user_id, au.email, COUNT(*) AS sessions
FROM hevy_sessions hs
LEFT JOIN auth_user au ON au.id = hs.user_id
GROUP BY hs.user_id
ORDER BY sessions DESC
`,
  }).map((row) => ({
    userId: String(row.user_id),
    email: typeof row.email === "string" ? row.email : null,
    sessions: Number(row.sessions ?? 0),
  }));

  const owners =
    hevyOwners.length > 0
      ? hevyOwners
      : wranglerQuery({
          databaseName: database.name,
          sql: `
SELECT id AS user_id, email, 0 AS sessions
FROM auth_user
WHERE email NOT LIKE 'guest-%@anonymous.emi.invalid'
ORDER BY created_at ASC
`,
        }).map((row) => ({
          userId: String(row.user_id),
          email: typeof row.email === "string" ? row.email : null,
          sessions: Number(row.sessions ?? 0),
        }));

  if (owners.length === 0) {
    throw new Error("No hevy_sessions owners or non-guest auth users found to restore into");
  }

  console.log(hevyOwners.length > 0 ? "Owners before wipe:" : "Owners from auth_user fallback:");
  for (const owner of owners) {
    console.log(`- ${owner.userId} ${owner.email ?? "(no email)"} sessions=${owner.sessions}`);
  }

  const tables = tableNames({ databaseName: database.name });
  const wipeStatements = [
    "DELETE FROM hevy_sets",
    "DELETE FROM hevy_sessions",
    "DELETE FROM sync_cursors WHERE source = 'hevy'",
  ];
  if (tables.has("hevy_connections")) wipeStatements.push("DELETE FROM hevy_connections");
  if (tables.has("hevy_sync_state")) wipeStatements.push("DELETE FROM hevy_sync_state");

  for (const sql of wipeStatements) {
    wranglerQuery({ databaseName: database.name, sql });
  }

  const afterWipe = wranglerQuery({
    databaseName: database.name,
    sql: `
SELECT
  (SELECT COUNT(*) FROM hevy_sessions) AS sessions,
  (SELECT COUNT(*) FROM hevy_sets) AS sets
`,
  })[0];
  console.log(
    `Wiped. Remaining sessions=${afterWipe?.sessions ?? "?"} sets=${afterWipe?.sets ?? "?"}`,
  );

  await applyMigrationIfNeeded({
    accountId,
    apiToken,
    databaseId: database.uuid,
    databaseName: database.name,
  });

  console.log("Fetching workouts from Hevy API…");
  const { workouts, newestUpdatedAt } = await fetchAllWorkouts({ apiKey });
  console.log(`Fetched ${workouts.length} workouts`);

  for (const owner of owners) {
    const written = await upsertOwnerData({
      accountId,
      apiToken,
      databaseId: database.uuid,
      userId: owner.userId,
      apiKey,
      encryptionKey,
      workouts,
      newestUpdatedAt,
    });
    console.log(`Restored ${owner.userId}: sessions=${written.sessions} sets=${written.sets}`);
  }

  const finalCounts = wranglerQuery({
    databaseName: database.name,
    sql: `
SELECT
  (SELECT COUNT(*) FROM hevy_sessions) AS sessions,
  (SELECT COUNT(*) FROM hevy_sets) AS sets,
  (SELECT COUNT(*) FROM hevy_connections) AS connections,
  (SELECT COUNT(*) FROM hevy_sync_state) AS sync_state
`,
  })[0];
  console.log("Final counts:", finalCounts);
};

await main();
