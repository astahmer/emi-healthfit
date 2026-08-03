import { describe, expect, it } from "vitest";
import { chatModels, defaultModel, modelCatalog } from "./models";

describe("chat model catalog", () => {
  it("tracks the current OpenAI choices and standard prices", () => {
    expect(chatModels.map((model) => model.id)).toEqual([
      "gpt-4o-mini",
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
    ]);
    expect(defaultModel.id).toBe("gpt-5.6-terra");
    expect(modelCatalog.pricingSource).toBe("https://developers.openai.com/api/docs/pricing");
    expect(chatModels).toMatchObject([
      { id: "gpt-4o-mini", pricing: { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 } },
      { id: "gpt-5.6-luna", pricing: { inputUsdPerMillion: 0.2, outputUsdPerMillion: 1.2 } },
      { id: "gpt-5.6-terra", pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 12 } },
      { id: "gpt-5.6-sol", pricing: { inputUsdPerMillion: 5, outputUsdPerMillion: 30 } },
    ]);
  });

  it("keeps web search available on the GPT-5.6 choices", () => {
    expect(
      chatModels
        .filter((model) => model.id.startsWith("gpt-5.6"))
        .every((model) => model.capabilities.webSearch),
    ).toBe(true);
  });
});
