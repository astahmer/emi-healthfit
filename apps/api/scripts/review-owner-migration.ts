import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as Schema from "effect/Schema";

const RequiredEnvironment = Schema.Struct({
  CLOUDFLARE_API_TOKEN: Schema.String.check(Schema.isMinLength(1)),
  CLOUDFLARE_ACCOUNT_ID: Schema.String.check(Schema.isMinLength(1)),
  D1_DATABASE_ID: Schema.String.check(Schema.isUUID()),
});

const QueryResponse = Schema.Struct({
  success: Schema.Literal(true),
  result: Schema.Array(
    Schema.Struct({
      success: Schema.Literal(true),
      results: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
    }),
  ),
});

const countsSql = `
SELECT
  (SELECT id FROM auth_user ORDER BY created_at LIMIT 1) owner_id,
  (SELECT email FROM auth_user ORDER BY created_at LIMIT 1) owner_email,
  (SELECT COUNT(*) FROM auth_user) auth_users,
  (SELECT COUNT(*) FROM daily_activity) daily_activity,
  (SELECT COUNT(*) FROM health_workouts) health_workouts,
  (SELECT COUNT(*) FROM hevy_sessions) hevy_sessions,
  (SELECT COUNT(*) FROM hevy_sets) hevy_sets,
  (SELECT COUNT(*) FROM sleep_sessions) sleep_sessions,
  (SELECT COUNT(*) FROM body_metrics) body_metrics,
  (SELECT COUNT(*) FROM sync_cursors) sync_cursors,
  (SELECT COUNT(*) FROM conversations) conversations,
  (SELECT COUNT(*) FROM messages) messages,
  (SELECT COUNT(*) FROM threads) threads,
  (SELECT COUNT(*) FROM thread_messages) thread_messages,
  (SELECT COUNT(*) FROM suggestions) suggestions,
  (SELECT COUNT(*) FROM memories) memories,
  (SELECT COUNT(*) FROM notes) notes,
  (SELECT COUNT(*) FROM chat_generations) chat_generations,
  (SELECT COUNT(*) FROM chat_generation_chunks) chat_generation_chunks;
`;

const main = async () => {
  const environment = Schema.decodeUnknownSync(RequiredEnvironment)(process.env);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${environment.CLOUDFLARE_ACCOUNT_ID}/d1/database/${environment.D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${environment.CLOUDFLARE_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql: countsSql }),
    },
  );
  if (!response.ok) throw new Error(`D1 count query failed with ${response.status}`);
  const decoded = Schema.decodeUnknownSync(QueryResponse)(await response.json());
  const counts = decoded.result[0]?.results[0];
  if (counts === undefined) throw new Error("D1 count query returned no row");
  console.table(counts);
  if (counts.auth_users !== 1 || typeof counts.owner_id !== "string") {
    throw new Error("Legacy data backfill requires exactly one enrolled auth user");
  }
  const prompt = createInterface({ input: stdin, output: stdout });
  const confirmation = await prompt.question(
    `Type owner id ${counts.owner_id} to approve these backfill counts: `,
  );
  prompt.close();
  if (confirmation !== counts.owner_id) throw new Error("Backfill review was not confirmed");
  console.log("Counts approved. Deploy ownership migration without enrolling another user.");
};

await main();
