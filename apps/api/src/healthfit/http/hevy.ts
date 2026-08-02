import { BadRequest } from "@emi/core/contract";
import { HealthFitApi } from "@emi/flavor-healthfit/contract";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import * as Cloudflare from "alchemy/Cloudflare";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";
import { deleteRawUploads } from "./data.ts";
import { withInternalError } from "../../core/http/errors.ts";

type ReadWriteBucketClient = Effect.Success<ReturnType<typeof Cloudflare.R2.ReadWriteBucket>>;

const toHealthfitDb = (db: QueryDatabaseClient) =>
  narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);

const {
  CredentialConfig: HevyCredentialConfigError,
  CredentialCrypto: HevyCredentialCryptoError,
  Http: HevyHttpError,
  Network: HevyNetworkError,
  NotConnected: HevyNotConnectedError,
} = HealthFit.hevy.errors;
const {
  connect: connectHevy,
  disconnect: disconnectHevy,
  getIntegrationStatus: getHevyIntegrationStatus,
  sync: syncHevy,
} = HealthFit.hevy;
const { deleteIngestedSource } = HealthFit.ingest;

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
}: {
  bucket: ReadWriteBucketClient;
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
}) => {
  const hevyDb = toHealthfitDb(db);
  return HttpApiBuilder.group(HealthFitApi, "hevy", (handlers) =>
    handlers
      .handle(
        "status",
        Effect.fn("httpApi.hevy.status")(function* () {
          const user = yield* CoreCloudflare.user.CurrentUser;
          return yield* getHevyIntegrationStatus({ db: hevyDb, userId: user.id });
        }, withInternalError),
      )
      .handle(
        "connect",
        Effect.fn("httpApi.hevy.connect")(function* ({ payload }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
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
        }, withInternalError),
      )
      .handle(
        "sync",
        Effect.fn("httpApi.hevy.sync")(function* () {
          const user = yield* CoreCloudflare.user.CurrentUser;
          return yield* syncHevy({
            db: hevyDb,
            userId: user.id,
            environment,
            force: true,
          }).pipe(Effect.mapError(mapHevyError));
        }, withInternalError),
      )
      .handle(
        "disconnect",
        Effect.fn("httpApi.hevy.disconnect")(function* () {
          const user = yield* CoreCloudflare.user.CurrentUser;
          yield* disconnectHevy({ db: hevyDb, userId: user.id });
          return { success: true as const };
        }, withInternalError),
      )
      .handle(
        "removeData",
        Effect.fn("httpApi.hevy.removeData")(function* () {
          const user = yield* CoreCloudflare.user.CurrentUser;
          yield* deleteIngestedSource({ db: toHealthfitDb(db), userId: user.id, source: "hevy" });
          const deletedRawUploads = yield* deleteRawUploads({
            bucket,
            prefix: `${user.id}/hevy/`,
          });
          return { deletedRawUploads };
        }, withInternalError),
      ),
  );
};
