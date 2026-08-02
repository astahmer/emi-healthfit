import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  buildGeneratedFiles,
  DEFAULT_CORE_VERSION,
  DEFAULT_DISTRIBUTION_MODE,
} from "../src/generate.ts";
import { workspaceConfig } from "../src/templates.ts";

const findFile = (files: { path: string; contents: string }[], path: string) => {
  const file = files.find((candidate) => candidate.path === path);
  assert.ok(file !== undefined, `expected generated file "${path}"`);
  return file;
};

describe("buildGeneratedFiles", () => {
  it("emits an owned workspace with editable core source by default", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const paths = files.map((file) => file.path).toSorted();

    for (const path of [
      "package.json",
      "pnpm-workspace.yaml",
      ".oxfmtrc.json",
      "core/package.json",
      "core/source-manifest.json",
      "core/src/protocol/index.ts",
      "core/test/public-api/export-surface.test.ts",
      "migration/package.json",
      "migration/src/server.ts",
      "core/tsconfig.json",
      "web/src/app.tsx",
      "web/postcss.config.mjs",
      "web/test/api.integration.test.ts",
      "web/test/e2e/generic-chat.spec.ts",
      "web/test/e2e/mock-api.ts",
      "web/test/e2e/layout.spec.ts",
      "worker/src/generic.worker.ts",
    ]) {
      assert.ok(paths.includes(path), `expected generated file "${path}"`);
    }
    assert.equal(DEFAULT_DISTRIBUTION_MODE, "owned");

    const corePackage = JSON.parse(findFile(files, "core/package.json").contents) as {
      private: boolean;
      files: string[];
      exports: Record<string, string | { types: string; import: string }>;
      emi: { sourceDistribution?: { manifest: string; provenance: string } };
    };
    assert.equal(corePackage.private, true);
    assert.deepEqual(corePackage.files, ["src", "test", "PUBLISH.md", "source-manifest.json"]);
    assert.equal(corePackage.exports["."], "./src/index.ts");
    assert.equal(corePackage.exports["./protocol"], "./src/protocol/index.ts");
    assert.equal(corePackage.exports["./styles.css"], "./src/styles/styles.css");
    assert.equal(corePackage.emi.sourceDistribution?.manifest, "./source-manifest.json");
    assert.match(
      findFile(files, "core/source-manifest.json").contents,
      /@emi\/core source catalog r0/,
    );
  });

  it("defaults @emi/core dependency version to workspace:*", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const webPackageJson = JSON.parse(findFile(files, "web/package.json").contents) as {
      name: string;
      dependencies: Record<string, string>;
    };
    const workerPackageJson = JSON.parse(findFile(files, "worker/package.json").contents) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    assert.equal(webPackageJson.name, "acme-chat-web");
    assert.equal(webPackageJson.dependencies["@emi/core"], DEFAULT_CORE_VERSION);

    assert.equal(workerPackageJson.name, "acme-chat-worker");
    assert.equal(workerPackageJson.dependencies["@emi/core"], DEFAULT_CORE_VERSION);
    assert.equal(workerPackageJson.dependencies["@emi/core-migration"], "workspace:*");
    assert.equal(workerPackageJson.devDependencies["@effect/platform-node"], "catalog:");
  });

  it("keeps the standalone catalog limited to generated project dependencies", () => {
    const config = workspaceConfig({
      appName: "Acme Chat",
      coreVersion: DEFAULT_CORE_VERSION,
      distributionMode: "owned",
      slug: "acme-chat",
    });

    for (const dependency of [
      "@ai-sdk/openai",
      "@playwright/test",
      "alchemy",
      "better-auth",
      "react",
      "wrangler",
    ]) {
      assert.ok(
        config.includes(`  "${dependency}":`) || config.includes(`  ${dependency}:`),
        dependency,
      );
    }
    for (const unrelatedDependency of [
      "@tanstack/react-query",
      "@tanstack/react-router",
      "@serwist/vite",
      "recharts",
      "zustand",
    ]) {
      assert.equal(
        config.includes(`  "${unrelatedDependency}":`) ||
          config.includes(`  ${unrelatedDependency}:`),
        false,
        unrelatedDependency,
      );
    }
  });

  it("supports dependency mode for an existing @emi/core package", () => {
    const files = buildGeneratedFiles({
      appName: "Acme Chat",
      coreVersion: "1.2.0",
      distributionMode: "dependency",
    });
    const webPackageJson = JSON.parse(findFile(files, "web/package.json").contents) as {
      dependencies: Record<string, string>;
    };

    assert.equal(webPackageJson.dependencies["@emi/core"], "1.2.0");
    assert.ok(!files.some((file) => file.path.startsWith("core/")));
  });

  it("includes durable generation tables in the generated worker schema", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const schema = findFile(files, "worker/src/db/schema.ts").contents;

    assert.match(schema, /chatGenerations/);
    assert.match(schema, /chatGenerationChunks/);
    assert.match(schema, /chatEvents/);
  });

  it("generates a usable streaming web chat instead of a placeholder page", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const app = findFile(files, "web/src/app.tsx").contents;
    const packageJson = JSON.parse(findFile(files, "web/package.json").contents) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    assert.match(app, /createChatRuntime/);
    assert.match(app, /ChatProvider/);
    assert.match(app, /@emi\/core\/react/);
    assert.match(app, /@emi\/core\/components\/styled/);
    assert.match(app, /@emi\/core\/components/);
    assert.match(app, /baseUrl: `\$\{apiOrigin\}\/api`/);
    assert.match(app, /ChatApp/);
    assert.match(app, /releaseNotes/);
    assert.doesNotMatch(app, /Temporary chat|Settings/);
    assert.doesNotMatch(
      app,
      /genericChatAppMachine|conversation-store-event|createConversationClient|@emi\/core\/web/,
    );
    assert.doesNotMatch(app, /@xstate\/react|useActorRef|useSelector/);
    assert.equal(packageJson.dependencies.ai, undefined);
    assert.equal(packageJson.dependencies["@xstate/react"], undefined);
    assert.equal(packageJson.dependencies["class-variance-authority"], "catalog:");
    assert.equal(packageJson.dependencies["lucide-react"], "catalog:");
    assert.equal(packageJson.dependencies["radix-ui"], "catalog:");
    assert.equal(packageJson.devDependencies["@playwright/test"], "catalog:");
    assert.equal(packageJson.devDependencies.tailwindcss, "catalog:");
    assert.equal(packageJson.devDependencies.vitest, "catalog:");
    assert.equal(packageJson.scripts.test, "vitest run --exclude test/api.integration.test.ts");
    assert.equal(
      packageJson.scripts["test:api"],
      "vitest run --config vitest.integration.config.ts",
    );
    assert.equal(packageJson.scripts["test:e2e"], "playwright test");
  });

  it("generates the core streaming and replay worker routes", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const worker = findFile(files, "worker/src/generic.worker.ts").contents;

    assert.match(worker, /makeGenericChatRoutes/);
    assert.match(worker, /"POST", "\/api\/chat"/);
    assert.match(worker, /"GET", "\/api\/chat\/:conversationId\/stream"/);
    assert.match(worker, /"PATCH", "\/api\/conversations\/:conversationId"/);
    assert.match(worker, /"POST", "\/api\/conversations\/:conversationId\/threads"/);
    assert.match(worker, /"PATCH",\s+"\/api\/conversations\/:conversationId\/threads\/:threadId"/);
    assert.match(worker, /"GET", "\/api\/memories"/);
    assert.match(findFile(files, "web/public/service-worker.js").contents, /cacheName/);
  });

  it("copies canonical generic source and renders only app configuration", async () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const sourceFiles = [
      { generatedPath: "web/src/app.tsx", sourcePath: "../../../apps/generic-web/src/app.tsx" },
      { generatedPath: "web/src/app.css", sourcePath: "../../../apps/generic-web/src/app.css" },
      {
        generatedPath: "web/playwright.config.ts",
        sourcePath: "../../../apps/generic-web/playwright.config.ts",
      },
      {
        generatedPath: "web/vitest.integration.config.ts",
        sourcePath: "../../../apps/generic-web/vitest.integration.config.ts",
      },
      {
        generatedPath: "web/test/api.integration.test.ts",
        sourcePath: "../../../apps/generic-web/test/api.integration.test.ts",
      },
      {
        generatedPath: "web/test/e2e/layout.spec.ts",
        sourcePath: "../../../apps/generic-web/test/e2e/layout.spec.ts",
      },
      {
        generatedPath: "worker/src/generic.worker.ts",
        sourcePath: "../../../apps/generic-worker/src/generic.worker.ts",
      },
      {
        generatedPath: "worker/src/db/schema.ts",
        sourcePath: "../../../apps/generic-worker/src/db/schema.ts",
      },
    ];
    const sourceContents = await Promise.all(
      sourceFiles.map(async ({ sourcePath }) =>
        readFile(new URL(sourcePath, import.meta.url), "utf8"),
      ),
    );
    for (const [index, { generatedPath }] of sourceFiles.entries()) {
      assert.equal(findFile(files, generatedPath).contents, sourceContents[index], generatedPath);
    }
    assert.match(findFile(files, "web/src/app-config.ts").contents, /Acme Chat/);
    assert.match(findFile(files, "worker/src/app-config.ts").contents, /Acme Chat/);
  });

  it("never points @emi/* dependencies at a local src copy (relative path or file: protocol)", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    for (const path of ["web/package.json", "worker/package.json"]) {
      const packageJson = JSON.parse(findFile(files, path).contents) as {
        dependencies: Record<string, string>;
      };
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        if (!name.startsWith("@emi/")) continue;
        assert.ok(
          !version.startsWith(".") && !version.startsWith("file:") && !version.startsWith("/"),
          `expected ${name}@${version} in ${path} to reference a package, not a local path`,
        );
      }
    }
  });

  it("never emits a relative import into packages/core/src", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat", distributionMode: "dependency" });
    for (const file of files) {
      assert.doesNotMatch(
        file.contents,
        /\.\.\/\.\.\/packages\//,
        `${file.path} imports a monorepo-relative path`,
      );
      assert.doesNotMatch(file.contents, /packages\/core\/src/, file.path);
    }
  });
});
