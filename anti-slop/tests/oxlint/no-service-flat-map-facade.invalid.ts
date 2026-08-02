import * as Effect from "effect/Effect";

const ConversationDatabase = {};

export const program = Effect.flatMap(ConversationDatabase, (database) => Effect.succeed(database));
