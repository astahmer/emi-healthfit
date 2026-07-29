import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeJson } from "../src/core/lib/json-codec.ts";

const HEVY_SWAGGER_UI_INIT_URL = "https://api.hevyapp.com/docs/swagger-ui-init.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeOpenApiDocument = (value: unknown, path = "$"): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeOpenApiDocument(entry, `${path}[${index}]`));
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(value)) {
    normalized[key] = normalizeOpenApiDocument(nested, `${path}.${key}`);
  }

  // Hevy ships non-standard `{ type: "enum", enum: [...] }` schemas.
  // typed-openapi (and OAS) expect `{ type: "string", enum: [...] }`.
  if (normalized.type === "enum" && Array.isArray(normalized.enum)) {
    normalized.type = "string";
  }

  return normalized;
};

const extractSwaggerDoc = (source: string) => {
  const marker = '"swaggerDoc"';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("swaggerDoc marker not found in swagger-ui-init.js");
  }

  const objectStart = source.indexOf("{", markerIndex);
  if (objectStart < 0) {
    throw new Error("swaggerDoc object start not found");
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let quote: string | null = null;

  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === undefined) {
      break;
    }

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (character === "\\") {
        escapeNext = true;
        continue;
      }
      if (character === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      inString = true;
      quote = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(objectStart, index + 1);
      }
    }
  }

  throw new Error("swaggerDoc object was not closed");
};

const main = async () => {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(
    scriptDirectory,
    "../../../packages/flavor-healthfit/src/integrations/hevy/openapi/hevy.openapi.json",
  );

  const response = await fetch(HEVY_SWAGGER_UI_INIT_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Hevy swagger-ui-init.js (${response.status} ${response.statusText})`,
    );
  }

  const source = await response.text();
  const swaggerDocJson = extractSwaggerDoc(source);
  const document = normalizeOpenApiDocument(decodeJson(swaggerDocJson));
  if (!isRecord(document)) {
    throw new Error("Extracted OpenAPI document is not an object");
  }

  const openapi = document.openapi;
  if (openapi !== "3.0.0" && openapi !== "3.0.1" && openapi !== "3.1.0") {
    throw new Error(`Unexpected OpenAPI version: ${String(openapi)}`);
  }

  const paths = document.paths;
  if (!isRecord(paths) || Object.keys(paths).length === 0) {
    throw new Error("Extracted OpenAPI document has no paths");
  }

  const info = isRecord(document.info) ? document.info : undefined;
  const title = typeof info?.title === "string" ? info.title : "unknown";
  const version = typeof info?.version === "string" ? info.version : "";

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outputPath} (${Object.keys(paths).length} paths, ${title} ${version})`);
};

await main();
