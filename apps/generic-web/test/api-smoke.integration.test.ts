import { describe, expect, it } from "vitest";

import { createConversationClient } from "@emi/core/web";

const apiOrigin = process.env.GENERIC_API_SMOKE_ORIGIN ?? "http://127.0.0.1:3233";
const expectedWorkerName = process.env.GENERIC_EXPECTED_APP_NAME ?? "Core Chat";

describe("generic web and worker local API topology", () => {
  it("fetches health and structured conversation auth errors through the Vite path", async () => {
    const healthResponse = await fetch(`${apiOrigin}/api/health`);
    expect(healthResponse.headers.get("content-type")).toContain("application/json");
    expect(await healthResponse.json()).toEqual({ name: expectedWorkerName });

    const client = createConversationClient({ apiOrigin, fetch });
    await expect(client.listConversations({ search: "" })).rejects.toThrow(
      "Authentication required",
    );
  });
});
