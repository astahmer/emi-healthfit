import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGeneratedFiles, DEFAULT_CORE_VERSION } from "../src/generate.ts";

const findFile = (files: { path: string; contents: string }[], path: string) => {
  const file = files.find((candidate) => candidate.path === path);
  assert.ok(file !== undefined, `expected generated file "${path}"`);
  return file;
};

describe("buildGeneratedFiles", () => {
  it("emits exactly the expected file set for a given app name", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const paths = files.map((file) => file.path).toSorted();

    assert.deepEqual(paths, [
      ".env.example",
      ".gitignore",
      "README.md",
      "web/index.html",
      "web/package.json",
      "web/src/app.css",
      "web/src/app.tsx",
      "web/src/chat-settings.ts",
      "web/src/conversation-client.ts",
      "web/src/main.tsx",
      "web/tsconfig.json",
      "web/vite-env.d.ts",
      "web/vite.config.ts",
      "worker/alchemy.run.ts",
      "worker/drizzle.config.ts",
      "worker/migrations/.gitkeep",
      "worker/package.json",
      "worker/src/app.worker.ts",
      "worker/src/db/schema.ts",
      "worker/tsconfig.json",
    ]);
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
    const conversationClient = findFile(files, "web/src/conversation-client.ts").contents;
    assert.match(conversationClient, /validateStoredUIMessages/);
    assert.match(conversationClient, /\/clone/);
    assert.equal(packageJson.dependencies.ai, "catalog:");
  });

  it("generates the core streaming and replay worker routes", () => {
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
    const worker = findFile(files, "worker/src/app.worker.ts").contents;

    assert.match(worker, /makeGenericChatRoutes/);
    assert.match(worker, /"POST", "\/api\/chat"/);
    assert.match(worker, /"GET", "\/api\/chat\/:conversationId\/stream"/);
    assert.match(worker, /"PATCH", "\/api\/conversations\/:conversationId"/);
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
    const files = buildGeneratedFiles({ appName: "Acme Chat" });
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
