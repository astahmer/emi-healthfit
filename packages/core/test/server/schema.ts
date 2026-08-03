import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import * as AuthSchema from "../../src/server/db/auth-schema.ts";
import * as ChatSchema from "../../src/server/db/schema.ts";
import * as DiscordSchema from "../../src/server/db/discord-schema.ts";

const currentSchema = await generateSQLiteDrizzleJson({
  ...AuthSchema,
  ...ChatSchema,
  ...DiscordSchema,
});

const emptySchema = {
  ...currentSchema,
  tables: {},
  id: "empty-schema",
  prevId: "empty-schema",
};

export const schemaStatements = await generateSQLiteMigration(emptySchema, currentSchema);
