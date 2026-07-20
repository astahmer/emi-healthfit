import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  TypedStatusError,
  createApiClient,
  type Fetcher,
  type Schemas,
} from "./generated/hevy-api.generated.ts";

export const HEVY_API_BASE_URL = "https://api.hevyapp.com";

// TODO: regenerate generated client with `typed-openapi --runtime effect` once
// Effect Schema runtime is published (typedapi plans/effect-schema-runtime.md),
// then decode responses with Schema instead of trusting types-only casts.

export class HevyHttpError extends Schema.TaggedErrorClass<HevyHttpError>()("HevyHttpError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

export class HevyNetworkError extends Schema.TaggedErrorClass<HevyNetworkError>()(
  "HevyNetworkError",
  {
    message: Schema.String,
  },
) {}

export type HevyClientError = HevyHttpError | HevyNetworkError;

const createHevyFetcher = (): Fetcher => ({
  fetch: async (input) => {
    const headers = new Headers();

    if (input.urlSearchParams) {
      input.url.search = input.urlSearchParams.toString();
    }

    const body = ["post", "put", "patch", "delete"].includes(input.method.toLowerCase())
      ? JSON.stringify(input.parameters?.body)
      : undefined;

    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    if (input.parameters?.header) {
      for (const [key, value] of Object.entries(input.parameters.header)) {
        if (value != null) {
          headers.set(key, String(value));
        }
      }
    }

    return fetch(input.url, {
      method: input.method.toUpperCase(),
      ...(body === undefined ? {} : { body }),
      headers,
      ...input.overrides,
    });
  },
});

const mapHevyCause = (cause: unknown): HevyClientError => {
  if (cause instanceof TypedStatusError) {
    return new HevyHttpError({
      status: cause.status,
      message: `Hevy API request failed with status ${cause.status}`,
    });
  }

  if (cause instanceof HevyHttpError || cause instanceof HevyNetworkError) {
    return cause;
  }

  return new HevyNetworkError({
    message: "Hevy API network request failed",
  });
};

const hevyRequest = <A>(label: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: mapHevyCause,
  }).pipe(Effect.withSpan(`hevy.${label}`));

export type HevyClient = ReturnType<typeof createHevyClient>;

export const createHevyClient = ({ apiKey }: { apiKey: string }) => {
  const api = createApiClient(createHevyFetcher(), HEVY_API_BASE_URL);
  const header = { "api-key": apiKey };

  const validateConnection = Effect.fn("hevy.validateConnection")(function* () {
    return yield* hevyRequest("validateConnection", () => api.get("/v1/user/info", { header }));
  });

  const listWorkouts = Effect.fn("hevy.listWorkouts")(function* ({
    page,
    pageSize,
  }: {
    page?: number;
    pageSize?: number;
  } = {}) {
    return yield* hevyRequest("listWorkouts", () =>
      api.get("/v1/workouts", {
        header,
        query: {
          ...(page === undefined ? {} : { page }),
          ...(pageSize === undefined ? {} : { pageSize }),
        },
      }),
    );
  });

  const listWorkoutEvents = Effect.fn("hevy.listWorkoutEvents")(function* ({
    page,
    pageSize,
    since,
  }: {
    page?: number;
    pageSize?: number;
    since?: string;
  } = {}) {
    return yield* hevyRequest("listWorkoutEvents", () =>
      api.get("/v1/workouts/events", {
        header,
        query: {
          ...(page === undefined ? {} : { page }),
          ...(pageSize === undefined ? {} : { pageSize }),
          ...(since === undefined ? {} : { since }),
        },
      }),
    );
  });

  const getWorkout = Effect.fn("hevy.getWorkout")(function* ({ workoutId }: { workoutId: string }) {
    return yield* hevyRequest("getWorkout", () =>
      api.get("/v1/workouts/{workoutId}", {
        header,
        path: { workoutId },
      }),
    );
  });

  return {
    validateConnection,
    listWorkouts,
    listWorkoutEvents,
    getWorkout,
  };
};

export type HevyUserInfoResponse = Schemas.UserInfoResponse;
export type HevyWorkout = Schemas.Workout;
export type HevyPaginatedWorkoutEvents = Schemas.PaginatedWorkoutEvents;
