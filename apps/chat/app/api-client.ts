import { EmiApi } from "@emi/api-contract";
import * as Effect from "effect/Effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

export const runApi = <A, E>(
  useClient: (client: HttpApiClient.ForApi<typeof EmiApi>) => Effect.Effect<A, E, never>,
): Promise<A> =>
  Effect.runPromise(
    Effect.flatMap(HttpApiClient.make(EmiApi, { baseUrl: apiBase() }), useClient).pipe(
      Effect.provide(FetchHttpClient.layer),
    ),
  );
