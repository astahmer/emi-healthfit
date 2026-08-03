import { describe, expect, it } from "vitest";
import { WebMcp } from "../../src/web/webmcp.ts";

describe("WebMcp", () => {
  it("normalizes synchronous browser registration APIs", async () => {
    const registeredTools: string[] = [];
    const modelContext = WebMcp.detect({
      modelContext: {
        registerTool: (tool: { readonly name: string }) => {
          registeredTools.push(tool.name);
        },
      },
    });

    if (modelContext === undefined) throw new Error("Expected a WebMCP model context.");

    await expect(
      modelContext.registerTool({
        name: "probe",
        description: "Probe",
        inputSchema: { type: "object", properties: {} },
        execute: async () => null,
      }),
    ).resolves.toBeUndefined();
    expect(registeredTools).toEqual(["probe"]);
  });
});
