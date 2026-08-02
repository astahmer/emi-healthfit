// @ts-expect-error Generic protocol must not export platform database types.
import type { D1Database } from "@emi/core/protocol";
// @ts-expect-error Generic server must not export raw database schemas.
import type { ConversationDatabaseSchema } from "@emi/core/server";
// @ts-expect-error Generic server must not export raw database clients.
import type { QueryDatabaseClient } from "@emi/core/server";

declare const database: D1Database;
declare const conversationSchema: ConversationDatabaseSchema;
declare const queryDatabase: QueryDatabaseClient;

void database;
void conversationSchema;
void queryDatabase;
