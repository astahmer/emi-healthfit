import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";

const packageRoot = join(fileURLToPath(new URL("../..", import.meta.url)));

const targetEntrypoints = {
  ".": "facade",
  "./protocol": "protocol",
  "./api": "api",
  "./runtime": "runtime",
  "./react": "react",
  "./components": "components",
  "./components/styled": "styled-components",
  "./styles.css": "styles",
  "./server": "server",
  "./server/effect": "server-effect",
  "./server/fetch": "server-fetch",
  "./adapters/ai-sdk": "ai-sdk-adapter",
  "./adapters/cloudflare": "cloudflare-adapter",
  "./extensions": "extensions",
  "./testing": "testing",
  "./advanced/xstate": "advanced-xstate",
} as const;

const targetEntrypointPaths = {
  ".": "./src/index.ts",
  "./protocol": "./src/protocol/index.ts",
  "./api": "./src/api/index.ts",
  "./runtime": "./src/runtime/index.ts",
  "./react": "./src/react/index.ts",
  "./components": "./src/components/index.ts",
  "./components/styled": "./src/components/styled/index.ts",
  "./styles.css": "./src/styles/styles.css",
  "./server": "./src/server/index.ts",
  "./server/effect": "./src/server/effect/index.ts",
  "./server/fetch": "./src/server/fetch/index.ts",
  "./adapters/ai-sdk": "./src/adapters/ai-sdk/index.ts",
  "./adapters/cloudflare": "./src/adapters/cloudflare/index.ts",
  "./extensions": "./src/extensions/index.ts",
  "./testing": "./src/testing/index.ts",
  "./advanced/xstate": "./src/advanced/xstate/index.ts",
} as const;

const dependencyMatrix = {
  ".": {
    runtime: ["xstate"],
    peer: [],
    optional: [],
    forbidden: ["react", "ai", "@ai-sdk/openai", "@cloudflare/workers-types", "drizzle-orm"],
  },
  "./protocol": {
    runtime: ["effect"],
    peer: [],
    optional: [],
    forbidden: [
      "react",
      "xstate",
      "ai",
      "@ai-sdk/openai",
      "drizzle-orm",
      "@cloudflare/workers-types",
    ],
  },
  "./api": {
    runtime: ["effect"],
    peer: [],
    optional: [],
    forbidden: ["react", "xstate", "ai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./runtime": {
    runtime: ["xstate"],
    peer: [],
    optional: [],
    forbidden: ["react", "ai", "@ai-sdk/openai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./react": {
    runtime: [],
    peer: ["react", "react-dom"],
    optional: [],
    forbidden: ["ai", "@ai-sdk/openai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./components": {
    runtime: [],
    peer: ["react"],
    optional: [],
    forbidden: ["xstate", "ai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./components/styled": {
    runtime: [],
    peer: ["react"],
    optional: ["class-variance-authority", "clsx", "lucide-react", "radix-ui", "tailwind-merge"],
    forbidden: ["ai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./styles.css": {
    runtime: [],
    peer: [],
    optional: [],
    forbidden: ["react", "xstate", "ai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./server": {
    runtime: ["effect"],
    peer: [],
    optional: [],
    forbidden: [
      "react",
      "xstate",
      "ai",
      "@ai-sdk/openai",
      "drizzle-orm",
      "@cloudflare/workers-types",
    ],
  },
  "./server/effect": {
    runtime: ["effect"],
    peer: [],
    optional: [],
    forbidden: ["react", "ai", "@ai-sdk/openai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./server/fetch": {
    runtime: ["effect"],
    peer: [],
    optional: [],
    forbidden: [
      "react",
      "xstate",
      "ai",
      "@ai-sdk/openai",
      "drizzle-orm",
      "@cloudflare/workers-types",
    ],
  },
  "./adapters/ai-sdk": {
    runtime: ["ai"],
    peer: [],
    optional: ["@ai-sdk/openai"],
    forbidden: ["react", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./adapters/cloudflare": {
    runtime: ["alchemy", "drizzle-orm", "kysely", "kysely-d1"],
    peer: [],
    optional: ["@cloudflare/workers-types"],
    forbidden: ["react", "ai", "@ai-sdk/openai"],
  },
  "./extensions": {
    runtime: [],
    peer: [],
    optional: [],
    forbidden: ["react", "xstate", "ai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./testing": {
    runtime: ["xstate"],
    peer: [],
    optional: [],
    forbidden: ["react", "ai", "@ai-sdk/openai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./advanced/xstate": {
    runtime: ["xstate"],
    peer: [],
    optional: [],
    forbidden: ["react", "ai", "@ai-sdk/openai", "drizzle-orm", "@cloudflare/workers-types"],
  },
} as const;

const advancedEntrypoints = {
  xstate: "./advanced/xstate",
  effect: "./server/effect",
} as const;

const StringMap = Schema.Record(Schema.String, Schema.String);
const DependencyEntry = Schema.Struct({
  runtime: Schema.Array(Schema.String),
  peer: Schema.Array(Schema.String),
  optional: Schema.Array(Schema.String),
  forbidden: Schema.Array(Schema.String),
});
const PackageJson = Schema.Struct({
  exports: StringMap,
  emi: Schema.Struct({
    publicApi: Schema.Struct({
      version: Schema.Literal("r0"),
      entrypoints: StringMap,
      entrypointPaths: StringMap,
      advancedEntrypoints: StringMap,
      dependencyMatrix: Schema.Record(Schema.String, DependencyEntry),
      legacySourceEntrypoints: Schema.Array(Schema.String),
      rewriteGates: Schema.Array(Schema.String),
    }),
  }),
});

describe("@emi/core R0 public catalog", () => {
  it("freezes the target entrypoint names before implementation moves", async () => {
    const packageJson = Schema.decodeUnknownSync(PackageJson)(
      JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")),
    );

    const exports = packageJson.exports;
    for (const [entrypoint, sourcePath] of Object.entries(targetEntrypointPaths)) {
      assert.equal(exports[entrypoint], sourcePath);
    }
    assert.equal(
      Object.keys(exports).some((entrypoint) => entrypoint.includes("*")),
      false,
    );
    assert.deepEqual(packageJson.emi.publicApi.entrypoints, targetEntrypoints);
    assert.deepEqual(packageJson.emi.publicApi.entrypointPaths, targetEntrypointPaths);
    assert.deepEqual(packageJson.emi.publicApi.dependencyMatrix, dependencyMatrix);
    assert.deepEqual(packageJson.emi.publicApi.advancedEntrypoints, advancedEntrypoints);
  });
});
