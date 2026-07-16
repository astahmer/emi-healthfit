import assert from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

const migrationDirectory = new URL("../migrations/", import.meta.url);
const legacyMigrations = [
  "0001_init.sql",
  "0002_threads.sql",
  "0003_usage_and_limits.sql",
  "0004_suggestions.sql",
  "0005_memories.sql",
  "0006_notes.sql",
  "0007_message_model.sql",
  "0008_conversation_threading.sql",
  "0009_chat_generations.sql",
  "0010_conversation_actions.sql",
  "0011_privacy_preferences.sql",
  "0012_auth.sql",
];

const executeMigration = ({ database, name }: { database: DatabaseSync; name: string }) => {
  const sql = readFileSync(new URL(name, migrationDirectory), "utf8").replaceAll(
    "--> statement-breakpoint",
    "",
  );
  database.exec(sql);
};

const makeLegacyDatabase = () => {
  const database = new DatabaseSync(":memory:");
  for (const name of legacyMigrations) executeMigration({ database, name });
  return database;
};

describe("ownership migration", () => {
  it("backfills every legacy row to the sole existing auth user", () => {
    const database = makeLegacyDatabase();
    database.exec(`
      INSERT INTO auth_user (id, name, email, email_verified) VALUES ('owner', 'Owner', 'owner@example.com', 1);
      INSERT INTO daily_activity (date, steps) VALUES ('2026-07-16', 123);
      INSERT INTO conversations (id, title, status, created_at, updated_at) VALUES ('conversation-1', 'Private', 'regular', 'now', 'now');
      INSERT INTO messages (id, conversation_id, role, parts, created_at) VALUES ('message-1', 'conversation-1', 'user', '[]', 'now');
      INSERT INTO notes (id, content, created_at, updated_at) VALUES ('note-1', 'Private', 'now', 'now');
    `);

    executeMigration({ database, name: "20260716193921_absent_joystick.sql" });

    for (const table of ["daily_activity", "conversations", "messages", "notes"]) {
      const row = database.prepare(`SELECT user_id FROM ${table} LIMIT 1`).get();
      assert.strictEqual(Reflect.get(row ?? {}, "user_id"), "owner", table);
    }
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO notes (id, content, created_at, updated_at) VALUES ('missing-owner', 'x', 'now', 'now')",
          )
          .run(),
      /notes.user_id is required/,
    );
  });

  it("refuses ambiguous backfill when legacy data and two users exist", () => {
    const database = makeLegacyDatabase();
    database.exec(`
      INSERT INTO auth_user (id, name, email, email_verified) VALUES ('alice', 'Alice', 'alice@example.com', 1);
      INSERT INTO auth_user (id, name, email, email_verified) VALUES ('bob', 'Bob', 'bob@example.com', 1);
      INSERT INTO notes (id, content, created_at, updated_at) VALUES ('note-1', 'Private', 'now', 'now');
    `);
    assert.throws(
      () => executeMigration({ database, name: "20260716193921_absent_joystick.sql" }),
      /CHECK constraint failed/,
    );
  });

  it("supports a fresh database before its first user enrolls", () => {
    const database = makeLegacyDatabase();
    executeMigration({ database, name: "20260716193921_absent_joystick.sql" });
    const columns = database.prepare("PRAGMA table_info(daily_activity)").all();
    assert.ok(columns.some((column) => Reflect.get(column, "name") === "user_id"));
  });
});
