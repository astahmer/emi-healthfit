// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { createAiSdkModelProvider } from "@emi/core/adapters/ai-sdk";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { createCloudflareRepositories } from "@emi/core/adapters/cloudflare";

const model = createAiSdkModelProvider({ model: "example", apiKey: "test" });
const repositories = createCloudflareRepositories({
  database: { prepare: () => ({ bind: () => undefined }) },
});

void model;
void repositories;
