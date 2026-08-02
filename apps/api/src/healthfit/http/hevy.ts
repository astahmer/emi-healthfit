import { BadRequest } from "@emi/core/contract";
import { HealthFitApi } from "@emi/flavor-healthfit/contract";
import type { HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import * as Cloudflare from "alchemy/Cloudflare";
import { CurrentUser } from "../../core/auth/request-auth.ts";
import { deleteIngestedSource } from "../db/ingested-data.ts";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";
import { deleteRawUploads } from "./data.ts";
import { withInternalError } from "../../core/http/errors.ts";
import {
  HevyCredentialConfigError,
  HevyCredentialCryptoError,
} from "../integrations/hevy/credential-crypto.ts";
import { HevyHttpError, HevyNetworkError } from "../integrations/hevy/hevy-client.ts";
import {
  HevyNotConnectedError,
  connectHevy,
  disconnectHevy,
  getHevyIntegrationStatus,
  syncHevy,
} from "../integrations/hevy/hevy-sync.ts";

type ReadWriteBucketClient = Effect.Success<ReturnType<typeof Cloudflare.R2.ReadWriteBucket>>;

const mapHevyError = (error: unknown) => {
  if (error instanceof BadRequest) return error;
  if (
    error instanceof HevyNotConnectedError ||
    error instanceof HevyCredentialConfigError ||
    error instanceof HevyCredentialCryptoError ||
    error instanceof HevyHttpError ||
    error instanceof HevyNetworkError
  ) {
    return new BadRequest({ message: error.message });
  }
  return error;
};

export const hevyHandlers = ({
  bucket,
  db,
  environment,
  runtimeContext,
}: {
  bucket: ReadWriteBucketClient;
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  runtimeContext: Context.Context<never>;
}) => {
  const hevyDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);
  return HttpApiBuilder.group(HealthFitApi, "hevy", (handlers) =>
    handlers
      .handle(
        "status",
        Effect.fn("httpApi.hevy.status")(
          function* () {
            const user = yield* CurrentUser;
            return yield* getHevyIntegrationStatus({ db: hevyDb, userId: user.id });
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "connect",
        Effect.fn("httpApi.hevy.connect")(
          function* ({ payload }) {
            const user = yield* CurrentUser;
            const connected = yield* connectHevy({
              db: hevyDb,
              userId: user.id,
              apiKey: payload.apiKey,
              environment,
            }).pipe(Effect.mapError(mapHevyError));
            const status = yield* getHevyIntegrationStatus({ db: hevyDb, userId: user.id });
            const { providerUserName, ...sync } = connected;
            return {
              status,
              sync,
              providerUserName,
            };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "sync",
        Effect.fn("httpApi.hevy.sync")(
          function* () {
            const user = yield* CurrentUser;
            return yield* syncHevy({
              db: hevyDb,
              userId: user.id,
              environment,
              force: true,
            }).pipe(Effect.mapError(mapHevyError));
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "disconnect",
        Effect.fn("httpApi.hevy.disconnect")(
          function* () {
            const user = yield* CurrentUser;
            yield* disconnectHevy({ db: hevyDb, userId: user.id });
            return { success: true as const };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "removeData",
        Effect.fn("httpApi.hevy.removeData")(
          function* () {
            const user = yield* CurrentUser;
            yield* deleteIngestedSource({ db, userId: user.id, source: "hevy" });
            const deletedRawUploads = yield* deleteRawUploads({
              bucket,
              prefix: `${user.id}/hevy/`,
            });
            return { deletedRawUploads };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      ),
  );
};
