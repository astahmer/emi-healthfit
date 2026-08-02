import { BadRequest, CoreApi, NotFound } from "@emi/core/contract";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ServerDatabase } from "@emi/core/server/database";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { withInternalError } from "./errors.ts";

export const discordHandlers = () =>
  HttpApiBuilder.group(CoreApi, "discord", (handlers) =>
    Effect.gen(function* () {
      const database = yield* ServerDatabase.discordLinks;
      return handlers
        .handle(
          "list",
          Effect.fn("httpApi.discord.list")(function* () {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const [links, codes] = yield* Effect.all([
              database.listAccountLinks({ userId: user.id }),
              database.listLinkCodes({ userId: user.id }),
            ]);
            return { links, codes };
          }, withInternalError),
        )
        .handle(
          "createCode",
          Effect.fn("httpApi.discord.createCode")(function* () {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const created = yield* database.createLinkCode({ userId: user.id });
            if (created === null) {
              return yield* new BadRequest({
                message:
                  "Too many active Discord link codes. Wait for one to expire or revoke them.",
              });
            }
            return created;
          }, withInternalError),
        )
        .handle(
          "revokeCode",
          Effect.fn("httpApi.discord.revokeCode")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const removed = yield* database.revokeLinkCode({
              userId: user.id,
              codeId: params.id,
            });
            if (!removed) return yield* new NotFound({ message: "Link code not found" });
            return { success: true as const };
          }, withInternalError),
        )
        .handle(
          "unlink",
          Effect.fn("httpApi.discord.unlink")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const removed = yield* database.unlinkAccount({
              userId: user.id,
              discordUserId: params.discordUserId,
            });
            if (!removed) return yield* new NotFound({ message: "Discord link not found" });
            return { success: true as const };
          }, withInternalError),
        );
    }),
  );
