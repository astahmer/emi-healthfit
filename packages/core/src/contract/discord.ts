import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Deleted, Identifier, StandardErrors } from "./common.ts";

export const DiscordLinkCode = Schema.Struct({
  id: Schema.String,
  expires_at: Schema.String,
  created_at: Schema.String,
  consumed_at: Schema.NullOr(Schema.String),
});
export type DiscordLinkCode = typeof DiscordLinkCode.Type;

export const CreatedDiscordLinkCode = Schema.Struct({
  id: Schema.String,
  code: Schema.String,
  expires_at: Schema.String,
  created_at: Schema.String,
});
export type CreatedDiscordLinkCode = typeof CreatedDiscordLinkCode.Type;

export const DiscordAccountLink = Schema.Struct({
  discord_user_id: Schema.String,
  created_at: Schema.String,
});
export type DiscordAccountLink = typeof DiscordAccountLink.Type;

export class DiscordApi extends HttpApiGroup.make("discord")
  .add(
    HttpApiEndpoint.get("list", "/discord/links", {
      success: Schema.Struct({
        links: Schema.Array(DiscordAccountLink),
        codes: Schema.Array(DiscordLinkCode),
      }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("createCode", "/discord/link-codes", {
      success: CreatedDiscordLinkCode.pipe(HttpApiSchema.status(201)),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("revokeCode", "/discord/link-codes/:id", {
      params: { id: Identifier },
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("unlink", "/discord/links/:discordUserId", {
      params: { discordUserId: Identifier },
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}
