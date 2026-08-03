import { ServerDatabase } from "@emi/core/server/database";

const query = ServerDatabase.query;
const tables = ServerDatabase.tables;
const conversations = ServerDatabase.conversations;
const replay = ServerDatabase.replay;
const memoryContext = ServerDatabase.memoryContext;
const database: ServerDatabase.QueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema> = {
  schema: {},
  environment: undefined as never,
};

void query;
void tables;
void conversations;
void replay;
void memoryContext;
void database;
