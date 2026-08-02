import * as Effect from "effect/Effect";
import { QueryDatabase } from "../../../../packages/core/src/server/db/query-database.ts";

export const query = QueryDatabase.tryPromise(() => Promise.resolve("ok"));
export const pure = Effect.succeed("ok");
