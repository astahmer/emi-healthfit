// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { AiSdkModelProvider } from "@emi/core/adapters/ai-sdk";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { CloudflareRepositories } from "@emi/core/adapters/cloudflare";

const model = AiSdkModelProvider.create({ model: "example", apiKey: "test" });
const repositories = CloudflareRepositories.fromDatabase({
  database: { prepare: () => ({ bind: () => undefined }) },
});

void model;
void repositories;
