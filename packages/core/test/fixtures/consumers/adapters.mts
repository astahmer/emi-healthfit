import * as Effect from "effect/Effect";
import { AiSdkModelProvider } from "@emi/core/adapters/ai-sdk";
import { CloudflareRepositories } from "@emi/core/adapters/cloudflare";

const modelLayer = AiSdkModelProvider.layer({ model: "example", apiKey: "test" });
const repositoriesLayer = CloudflareRepositories.layer({
  database: {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ meta: { changes: 0 } }),
      }),
    }),
  },
});

const model = Effect.runPromise(
  AiSdkModelProvider.use((provider) => Effect.succeed(provider)).pipe(
    Effect.provide(modelLayer),
  ),
);
const repositories = Effect.runPromise(
  CloudflareRepositories.use((value) => Effect.succeed(value)).pipe(
    Effect.provide(repositoriesLayer),
  ),
);

void model;
void repositories;
