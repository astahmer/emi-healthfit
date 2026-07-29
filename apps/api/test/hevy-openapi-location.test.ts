import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const apiHevyRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/healthfit/integrations/hevy",
);
const flavorOpenApi = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/flavor-healthfit/src/integrations/hevy/openapi/hevy.openapi.json",
);

describe("Hevy OpenAPI single-sourcing", () => {
  it("keeps the OpenAPI snapshot only under @emi/flavor-healthfit", () => {
    assert.equal(existsSync(flavorOpenApi), true);
    assert.equal(existsSync(join(apiHevyRoot, "openapi/hevy.openapi.json")), false);
    assert.equal(existsSync(join(apiHevyRoot, "generated/hevy-api.generated.ts")), false);
  });
});
