import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  buildGeneratedFiles,
  DEFAULT_CORE_VERSION,
  DEFAULT_DISTRIBUTION_MODE,
} from "../src/generate.ts";

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
      "core/src/chat/index.ts",
      "core/test/chat/request.test.ts",
      "core/tsconfig.json",
      "web/src/app.tsx",
      "worker/src/generic.worker.ts",
    ]) {
      assert.ok(paths.includes(path), `expected generated file "${path}"`);
    }
    assert.equal(DEFAULT_DISTRIBUTION_MODE, "owned");
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
    };

    assert.equal(webPackageJson.name, "acme-chat-web");
    assert.equal(webPackageJson.dependencies["@emi/core"], DEFAULT_CORE_VERSION);

    assert.equal(workerPackageJson.name, "acme-chat-worker");
    assert.equal(workerPackageJson.dependencies["@emi/core"], DEFAULT_CORE_VERSION);
  });

  it("supports dependency mode for an existing @emi/core package", () => {
    const files = buildGeneratedFiles({
      appName: "Acme Chat",
      coreVersion: "^1.2.0",
      distributionMode: "dependency",
    });
    const webPackageJson = JSON.parse(findFile(files, "web/package.json").contents) as {
      dependencies: Record<string, string>;
    };

    assert.equal(webPackageJson.dependencies["@emi/core"], "^1.2.0");
    assert.ok(!files.some((file) => file.path.startsWith("core/")));
  });

  it("includes durable generation tables in the generated worker schema", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const schema = findFile(files, "worker/src/db/schema.ts").contents;

    assert.match(schema, /chatGenerations/);
    assert.match(schema, /chatGenerationChunks/);
    assert.match(schema, /chatEvents/);
  });

  it("generates a usable streaming web chat instead of a smoke page", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const app = findFile(files, "web/src/app.tsx").contents;
    const packageJson = JSON.parse(findFile(files, "web/package.json").contents) as {
      dependencies: Record<string, string>;
    };

    assert.match(app, /DefaultChatTransport/);
    assert.match(app, /\/api\/chat/);
    assert.match(app, /Temporary chat/);
    assert.match(app, /Queued follow-ups/);
    assert.match(app, /reconnectToStream/);
    assert.match(app, /Add attachments/);
    assert.match(app, /Search conversations/);
    assert.match(app, /draft is saved locally/);
    const conversationClient = findFile(files, "web/src/conversation-client.ts").contents;
    assert.match(conversationClient, /validateStoredUIMessages/);
    assert.match(conversationClient, /\/clone/);
    assert.equal(packageJson.dependencies.ai, "catalog:");
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
        generatedPath: "web/src/chat-session.ts",
        sourcePath: "../../../apps/generic-web/src/chat-session.ts",
      },
      {
        generatedPath: "web/src/conversation-client.ts",
        sourcePath: "../../../apps/generic-web/src/conversation-client.ts",
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
