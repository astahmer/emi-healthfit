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
  "./chat": "chat",
  "./contract": "contract",
  "./cloudflare": "cloudflare",
  "./discord": "discord",
  "./web": "web",
  "./runtime": "runtime",
  "./react": "react",
  "./components": "components",
  "./components/styled": "styled-components",
  "./styles.css": "styles",
  "./server": "server",
  "./server/database": "server-database",
  "./server/effect": "server-effect",
  "./server/fetch": "server-fetch",
  "./adapters/ai-sdk": "ai-sdk-adapter",
  "./adapters/cloudflare": "cloudflare-adapter",
  "./extensions": "extensions",
  "./testing": "testing",
  "./advanced/xstate": "advanced-xstate",
} as const;

const targetEntrypointPaths = {
  ".": "./src/core.export.ts",
  "./protocol": "./src/protocol.export.ts",
  "./api": "./src/api.export.ts",
  "./chat": "./src/chat.export.ts",
  "./contract": "./src/contract.export.ts",
  "./cloudflare": "./src/cloudflare.export.ts",
  "./discord": "./src/discord.export.ts",
  "./web": "./src/web.export.ts",
  "./runtime": "./src/runtime.export.ts",
  "./react": "./src/react.export.ts",
  "./components": "./src/components.export.ts",
  "./components/styled": "./src/components-styled.export.ts",
  "./styles.css": "./src/styles/styles.css",
  "./server": "./src/server.export.ts",
  "./server/database": "./src/server-database.export.ts",
  "./server/effect": "./src/server-effect.export.ts",
  "./server/fetch": "./src/server-fetch.export.ts",
  "./adapters/ai-sdk": "./src/adapters/ai-sdk.export.ts",
  "./adapters/cloudflare": "./src/adapters/cloudflare.export.ts",
  "./extensions": "./src/extensions.export.ts",
  "./testing": "./src/testing.export.ts",
  "./advanced/xstate": "./src/advanced-xstate.export.ts",
} as const;

const dependencyMatrix = {
  ".": {
    runtime: ["effect", "xstate"],
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
  "./chat": {
    runtime: ["effect"],
    peer: ["ai", "@ai-sdk/openai"],
    optional: [],
    forbidden: ["react", "xstate", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./contract": {
    runtime: ["effect"],
    peer: [],
    optional: [],
    forbidden: ["react", "xstate", "ai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./cloudflare": {
    runtime: ["effect"],
    peer: ["@ai-sdk/openai", "@cloudflare/workers-types", "ai"],
    optional: ["alchemy", "better-auth", "drizzle-orm", "kysely", "kysely-d1"],
    forbidden: ["react", "xstate"],
  },
  "./discord": {
    runtime: [],
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
  "./web": {
    runtime: ["effect"],
    peer: ["react", "react-dom"],
    optional: ["ai", "lucide-react"],
    forbidden: ["xstate", "@cloudflare/workers-types", "drizzle-orm"],
  },
  "./runtime": {
    runtime: ["effect", "xstate"],
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
    runtime: ["effect"],
    peer: ["react"],
    optional: [],
    forbidden: ["xstate", "ai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./components/styled": {
    runtime: ["effect"],
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
  "./server/database": {
    runtime: ["effect"],
    peer: ["ai"],
    optional: ["drizzle-orm", "kysely"],
    forbidden: ["react", "xstate", "@ai-sdk/openai", "@cloudflare/workers-types"],
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
    runtime: ["effect"],
    peer: ["@ai-sdk/openai", "ai"],
    optional: [],
    forbidden: ["react", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./adapters/cloudflare": {
    runtime: ["effect"],
    peer: [],
    optional: [],
    forbidden: ["react", "ai", "@ai-sdk/openai"],
  },
  "./extensions": {
    runtime: ["effect"],
    peer: [],
    optional: [],
    forbidden: ["react", "xstate", "ai", "drizzle-orm", "@cloudflare/workers-types"],
  },
  "./testing": {
    runtime: ["effect", "xstate"],
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

const ExportValue = Schema.Union([
  Schema.String,
  Schema.Struct({
    types: Schema.String,
    import: Schema.String,
  }),
]);
const DependencyEntry = Schema.Struct({
  runtime: Schema.Array(Schema.String),
  peer: Schema.Array(Schema.String),
  optional: Schema.Array(Schema.String),
  forbidden: Schema.Array(Schema.String),
});
const PackageJson = Schema.Struct({
  exports: Schema.Record(Schema.String, ExportValue),
  emi: Schema.Struct({
    publicApi: Schema.Struct({
      version: Schema.Literal("r0"),
      entrypoints: Schema.Record(Schema.String, Schema.String),
      entrypointPaths: Schema.Record(Schema.String, Schema.String),
      advancedEntrypoints: Schema.Record(Schema.String, Schema.String),
      dependencyMatrix: Schema.Record(Schema.String, DependencyEntry),
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
      const exportValue = exports[entrypoint];
      assert.ok(exportValue !== undefined);
      if (entrypoint === "./styles.css") {
        assert.equal(exportValue, "./dist/styles/styles.css");
        continue;
      }
      const outputPath = sourcePath.replace(/^\.\/src\//, "").replace(/\.(?:tsx?|mts|cts)$/, ".js");
      assert.deepEqual(exportValue, {
        types: `./dist/types/${outputPath.replace(/\.js$/, ".d.ts")}`,
        import: `./dist/${outputPath}`,
      });
    }
    assert.equal(
      Object.keys(exports).some((entrypoint) => entrypoint.includes("*")),
      false,
    );
    assert.deepEqual(Object.keys(exports).toSorted(), Object.keys(targetEntrypoints).toSorted());
    assert.deepEqual(packageJson.emi.publicApi.entrypoints, targetEntrypoints);
    assert.deepEqual(packageJson.emi.publicApi.entrypointPaths, targetEntrypointPaths);
    assert.deepEqual(packageJson.emi.publicApi.dependencyMatrix, dependencyMatrix);
    assert.deepEqual(packageJson.emi.publicApi.advancedEntrypoints, advancedEntrypoints);
  });
});
