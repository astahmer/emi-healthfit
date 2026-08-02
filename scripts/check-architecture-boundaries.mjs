import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path)));
      continue;
    }
    if (sourceExtensions.has(path.slice(path.lastIndexOf(".")))) files.push(path);
  }
  return files;
};

const existing = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const violations = [];
const report = (path, line, message) => {
  violations.push(`${relative(repositoryRoot, path)}:${line}: ${message}`);
};

const lineNumber = (source, offset) => source.slice(0, offset).split("\n").length;

const scanText = async (path, patterns) => {
  const source = await readFile(path, "utf8");
  for (const pattern of patterns) {
    let match = pattern.expression.exec(source);
    while (match !== null) {
      report(path, lineNumber(source, match.index), pattern.message);
      match = pattern.expression.exec(source);
    }
    pattern.expression.lastIndex = 0;
  }
};

const main = async () => {
  const coreSource = join(repositoryRoot, "packages/core/src");
  const allSourceRoots = [
    join(repositoryRoot, "apps"),
    join(repositoryRoot, "packages"),
  ];
  const sourceFilesByRoot = [];
  for (const path of allSourceRoots) {
    if (await existing(path)) sourceFilesByRoot.push(await filesUnder(path));
  }
  const allSourceFiles = sourceFilesByRoot.flat();
  const coreSourceFiles = await filesUnder(coreSource);

  if (await existing(join(repositoryRoot, "packages/core-migration"))) {
    report(
      join(repositoryRoot, "packages/core-migration"),
      1,
      "@emi/core-migration is retired; migrate consumers to a named @emi/core boundary and delete the package.",
    );
  }

  for (const path of coreSourceFiles) {
    if (path.endsWith("/index.ts")) report(path, 1, "core implementation files must not be index.ts barrels.");
    await scanText(path, [
      {
        expression: /(?:from\s+|import\s*\(\s*)["'][^"']*\/index\.ts["']/g,
        message: "do not import an index.ts module; import the named implementation or .export.ts boundary.",
      },
      {
        expression: /export\s+(?:type\s+)?(?:\*|\{)[^;\n]*\sfrom\s+["']/g,
        message: "public bindings must be imported and owned locally; export-from re-exports are forbidden.",
      },
      {
        expression: /(?:server\/legacy|\bLegacy\w*|\blegacy\b|\bbackward\b)/g,
        message: "legacy/backward-compatibility code is not part of generic core.",
      },
      {
        expression: /\b(?:HealthFit|healthfit)\b/g,
        message: "generic core cannot contain HealthFit product code.",
      },
    ]);
  }

  for (const path of allSourceFiles) {
    await scanText(path, [
      {
        expression: /["']@emi\/core-migration(?:\/|["'])/g,
        message: "@emi/core-migration is retired; use a named @emi/core boundary or product package.",
      },
      {
        expression: /(?:from\s+|import\s*\(\s*)["'][^"']*\/index\.ts["']/g,
        message: "do not import index.ts modules inside a package boundary.",
      },
    ]);
  }

  for (const path of [
    join(repositoryRoot, "packages/core/src/server"),
    join(repositoryRoot, "packages/core/src/adapters"),
  ]) {
    for (const sourceFile of await filesUnder(path)) {
      await scanText(sourceFile, [
        {
          expression: /\bconstructor\s*\(/g,
          message: "server and adapter dependencies must be Effect Context services composed by Layer, not constructor DI.",
        },
      ]);
    }
  }

  for (const path of [
    join(repositoryRoot, "apps/chat/components/chat/message-rail.tsx"),
    join(repositoryRoot, "apps/chat/hooks/use-thread-viewport-scroll.ts"),
    join(repositoryRoot, "apps/chat/lib/chat-thread-scroll.ts"),
  ]) {
    if (await existing(path)) report(path, 1, "generic chat UI/runtime code belongs in @emi/core.");
  }

  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "packages/core/package.json"), "utf8"));
  for (const [entrypoint, source] of Object.entries(packageJson.emi.publicApi.entrypointPaths)) {
    if (entrypoint === "./styles.css") continue;
    if (!source.endsWith(".export.ts")) {
      report(
        join(repositoryRoot, "packages/core/package.json"),
        1,
        `${entrypoint} must point to a named .export.ts public boundary, received ${source}.`,
      );
    }
  }

  if (violations.length > 0) {
    console.error(`Architecture boundary check failed with ${violations.length} violation(s):`);
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log("Architecture boundary check passed.");
};

await main();
