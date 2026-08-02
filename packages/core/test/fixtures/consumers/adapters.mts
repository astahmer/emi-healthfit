import { AiSdkModelProvider } from "@emi/core/adapters/ai-sdk";
import { CloudflareRepositories } from "@emi/core/adapters/cloudflare";

const model = AiSdkModelProvider.create({ model: "example", apiKey: "test" });
const repositories = CloudflareRepositories.fromDatabase({
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

void model;
void repositories;
