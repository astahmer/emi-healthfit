import { BadRequest, CoreApi, NotFound } from "@emi/core/contract";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  createDiscordLinkCode,
  listDiscordAccountLinks,
  listDiscordLinkCodes,
  revokeDiscordLinkCode,
  unlinkDiscordAccount,
  type DiscordDatabaseSchema,
} from "@emi/core/server/legacy";
import { CurrentUser } from "../auth/request-auth.ts";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";

export const discordHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) => {
  const discordDb = narrowQueryDatabaseClient<DiscordDatabaseSchema>(db);
  return HttpApiBuilder.group(CoreApi, "discord", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.discord.list")(function* () {
          const user = yield* CurrentUser;
          const [links, codes] = yield* Effect.all([
            listDiscordAccountLinks(discordDb, user.id),
            listDiscordLinkCodes(discordDb, user.id),
          ]);
          return { links, codes };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "createCode",
        Effect.fn("httpApi.discord.createCode")(function* () {
          const user = yield* CurrentUser;
          const created = yield* createDiscordLinkCode(discordDb, user.id);
          if (created === null) {
            return yield* new BadRequest({
              message: "Too many active Discord link codes. Wait for one to expire or revoke them.",
            });
          }
          return created;
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "revokeCode",
        Effect.fn("httpApi.discord.revokeCode")(function* ({ params }) {
          const user = yield* CurrentUser;
          const removed = yield* revokeDiscordLinkCode(discordDb, user.id, params.id);
          if (!removed) return yield* new NotFound({ message: "Link code not found" });
          return { success: true as const };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "unlink",
        Effect.fn("httpApi.discord.unlink")(function* ({ params }) {
          const user = yield* CurrentUser;
          const removed = yield* unlinkDiscordAccount(discordDb, user.id, params.discordUserId);
          if (!removed) return yield* new NotFound({ message: "Discord link not found" });
          return { success: true as const };
        }, Effect.provide(runtimeContext)),
      ),
  );
};
