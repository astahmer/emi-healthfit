import { readFile, writeFile } from "node:fs/promises";

const pricingUrl = "https://developers.openai.com/api/docs/pricing.md";
const catalogUrl = new URL("../apps/chat/app/models.json", import.meta.url);
const currentTierPattern = /^gpt-\d+\.\d+-(sol|terra|luna)$/;

const parsePrice = ({ modelId, value }) => {
  const normalizedValue = value.replace("$", "").trim();
  if (normalizedValue === "-") return undefined;
  const price = Number(normalizedValue);
  if (!Number.isFinite(price)) {
    throw new Error(`Could not parse ${modelId} price: ${value}`);
  }
  return price;
};

const parseStandardPricing = (markdown) => {
  const sectionStart = markdown.indexOf("### Standard pricing data");
  if (sectionStart === -1)
    throw new Error("Official pricing table has no standard pricing section");
  const nextSection = markdown.indexOf("\n### ", sectionStart + 1);
  const section = markdown.slice(sectionStart, nextSection === -1 ? undefined : nextSection);
  const prices = new Map();

  for (const line of section.split("\n")) {
    const cells = line
      .trim()
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 5 || !cells[0].startsWith("gpt-")) continue;
    const modelId = cells[0].replace(/\s+\([^)]*\)$/, "");
    const input = parsePrice({ modelId, value: cells[1] });
    const output = parsePrice({ modelId, value: cells[4] });
    if (input === undefined || output === undefined) continue;
    prices.set(modelId, { input, output });
  }

  if (prices.size === 0) throw new Error("Official pricing table has no parseable model rows");
  return prices;
};

const readCatalog = async () => JSON.parse(await readFile(catalogUrl, "utf8"));

const validateCatalog = ({ catalog, officialPrices }) => {
  const errors = [];
  const trackedPricingIds = new Set();
  const modelIds = new Set();

  for (const model of catalog.models) {
    if (modelIds.has(model.id)) errors.push(`Duplicate catalog model: ${model.id}`);
    modelIds.add(model.id);

    const pricingId = model.pricingModelId ?? model.id;
    trackedPricingIds.add(pricingId);
    const official = officialPrices.get(pricingId);
    if (official === undefined) {
      errors.push(`${model.id} is missing from the official standard pricing table`);
      continue;
    }
    if (model.pricing.inputUsdPerMillion !== official.input) {
      errors.push(
        `${model.id} input price is ${model.pricing.inputUsdPerMillion}; official is ${official.input}`,
      );
    }
    if (model.pricing.outputUsdPerMillion !== official.output) {
      errors.push(
        `${model.id} output price is ${model.pricing.outputUsdPerMillion}; official is ${official.output}`,
      );
    }
  }

  if (!modelIds.has(catalog.defaultModelId)) {
    errors.push(`Default model is not in the catalog: ${catalog.defaultModelId}`);
  }

  const missingCurrentTiers = [...officialPrices.keys()].filter(
    (modelId) => currentTierPattern.test(modelId) && !trackedPricingIds.has(modelId),
  );
  if (missingCurrentTiers.length > 0) {
    errors.push(`Catalog is missing current OpenAI tiers: ${missingCurrentTiers.join(", ")}`);
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
};

const fetchOfficialPricing = async () => {
  const response = await fetch(pricingUrl);
  if (!response.ok) throw new Error(`Could not fetch official pricing: ${response.status}`);
  return parseStandardPricing(await response.text());
};

const updateCatalog = ({ catalog, officialPrices }) => ({
  ...catalog,
  lastReviewed: new Date().toISOString().slice(0, 10),
  models: catalog.models.map((model) => {
    const pricingId = model.pricingModelId ?? model.id;
    const official = officialPrices.get(pricingId);
    if (official === undefined) throw new Error(`No official price found for ${model.id}`);
    return {
      ...model,
      pricing: {
        ...model.pricing,
        inputUsdPerMillion: official.input,
        outputUsdPerMillion: official.output,
      },
    };
  }),
});

const main = async () => {
  const mode = process.argv[2];
  if (mode !== "--check" && mode !== "--write") {
    throw new Error("Usage: node scripts/update-openai-models.mjs --check|--write");
  }

  const [catalog, officialPrices] = await Promise.all([readCatalog(), fetchOfficialPricing()]);
  validateCatalog({ catalog, officialPrices });

  if (mode === "--check") {
    console.log(
      `Model catalog matches official standard pricing for ${catalog.models.length} models (reviewed ${catalog.lastReviewed}).`,
    );
    return;
  }

  await writeFile(
    catalogUrl,
    `${JSON.stringify(updateCatalog({ catalog, officialPrices }), null, 2)}\n`,
  );
  console.log(`Updated ${catalog.models.length} models from ${pricingUrl}.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
