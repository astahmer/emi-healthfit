import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Content, Created, Deleted, Identifier, Limit } from "./common";

export class Note extends Schema.Class<Note>("Note")({
  id: Schema.String,
  content: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
}) {}

export class Memory extends Schema.Class<Memory>("Memory")({
  id: Schema.String,
  content: Schema.String,
  source: Schema.NullOr(Schema.String),
  thread_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  rank: Schema.optional(Schema.Number),
}) {}

export class NotesApi extends HttpApiGroup.make("notes")
  .add(
    HttpApiEndpoint.get("list", "/notes", {
      query: {
        search: Schema.optional(Schema.String),
        limit: Schema.optional(Limit),
      },
      success: Schema.Struct({ notes: Schema.Array(Note) }),
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/notes", {
      payload: Schema.Struct({ content: Content }),
      success: Created.pipe(HttpApiSchema.status(201)),
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/notes/:id", {
      params: { id: Identifier },
      payload: Schema.Struct({ content: Content }),
      success: Deleted,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/notes/:id", {
      params: { id: Identifier },
      success: Deleted,
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
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/memories", {
      payload: Schema.Struct({
        content: Content,
        source: Schema.optional(Schema.String),
        threadId: Schema.optional(Schema.String),
      }),
      success: Created.pipe(HttpApiSchema.status(201)),
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/memories/:id", {
      params: { id: Identifier },
      success: Deleted,
    }),
  )
  .prefix("/api") {}
