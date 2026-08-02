import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Content, Created, Deleted, Identifier, Limit, StandardErrors } from "./common.ts";

export const Note = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type Note = typeof Note.Type;

export const Memory = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  source: Schema.NullOr(Schema.String),
  thread_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  rank: Schema.optional(Schema.Number),
});
export type Memory = typeof Memory.Type;

export class NotesApi extends HttpApiGroup.make("notes")
  .add(
    HttpApiEndpoint.get("list", "/notes", {
      query: {
        search: Schema.optional(Schema.String),
        limit: Schema.optional(Limit),
      },
      success: Schema.Struct({ notes: Schema.Array(Note) }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/notes", {
      payload: Schema.Struct({ content: Content }),
      success: Created.pipe(HttpApiSchema.status(201)),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/notes/:id", {
      params: { id: Identifier },
      payload: Schema.Struct({ content: Content }),
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/notes/:id", {
      params: { id: Identifier },
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

export class MemoriesApi extends HttpApiGroup.make("memories")
  .add(
    HttpApiEndpoint.get("list", "/memories", {
      query: {
        search: Schema.optional(Schema.String),
        limit: Schema.optional(Limit),
      },
      success: Schema.Struct({ memories: Schema.Array(Memory) }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/memories", {
      payload: Schema.Struct({
        content: Content,
        source: Schema.optional(Schema.String),
        threadId: Schema.optional(Schema.String),
        messageId: Schema.optional(Schema.String),
      }),
      success: Created.pipe(HttpApiSchema.status(201)),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/memories/:id", {
      params: { id: Identifier },
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("removeByMessage", "/memories/message/:messageId", {
      params: { messageId: Identifier },
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}
