import { HealthFitApi } from "@emi/flavor-healthfit/contract";
import * as Effect from "effect/Effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

export const runApi = <A, E>(
  useClient: (client: HttpApiClient.ForApi<typeof HealthFitApi>) => Effect.Effect<A, E, never>,
  options?: { readonly signal?: AbortSignal },
): Promise<A> =>
  Effect.runPromise(
    Effect.flatMap(HttpApiClient.make(HealthFitApi, { baseUrl: apiBase() }), useClient).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, globalThis.fetch),
    ),
    options,
  );
