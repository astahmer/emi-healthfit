import { BadRequest, CoreApi, NotFound } from "@emi/core/contract";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ServerDatabase } from "@emi/core/server/database";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";

export const discordHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) => {
  const discordDb = narrowQueryDatabaseClient<ServerDatabase.DiscordDatabaseSchema>(db);
  const databaseLayer = ServerDatabase.discordLinks.layer({ db: discordDb });
  const provideDatabase = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(databaseLayer), Effect.provide(runtimeContext));
  return HttpApiBuilder.group(CoreApi, "discord", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.discord.list")(function* () {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const [links, codes] = yield* Effect.all([
            ServerDatabase.discordLinks.listAccountLinks({ userId: user.id }),
            ServerDatabase.discordLinks.listLinkCodes({ userId: user.id }),
          ]);
          return { links, codes };
        }, provideDatabase),
      )
      .handle(
        "createCode",
        Effect.fn("httpApi.discord.createCode")(function* () {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const created = yield* ServerDatabase.discordLinks.createLinkCode({ userId: user.id });
          if (created === null) {
            return yield* new BadRequest({
              message: "Too many active Discord link codes. Wait for one to expire or revoke them.",
            });
          }
          return created;
        }, provideDatabase),
      )
      .handle(
        "revokeCode",
        Effect.fn("httpApi.discord.revokeCode")(function* ({ params }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const removed = yield* ServerDatabase.discordLinks.revokeLinkCode({
            userId: user.id,
            codeId: params.id,
          });
          if (!removed) return yield* new NotFound({ message: "Link code not found" });
          return { success: true as const };
        }, provideDatabase),
      )
      .handle(
        "unlink",
        Effect.fn("httpApi.discord.unlink")(function* ({ params }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const removed = yield* ServerDatabase.discordLinks.unlinkAccount({
            userId: user.id,
            discordUserId: params.discordUserId,
          });
          if (!removed) return yield* new NotFound({ message: "Discord link not found" });
          return { success: true as const };
        }, provideDatabase),
      ),
  );
};
