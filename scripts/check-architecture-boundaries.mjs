import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".git" ||
      entry.name === ".alchemy"
    ) {
      continue;
    }
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

const scanForwardingClasses = async (path) => {
  const source = await readFile(path, "utf8");
  const namespaceImports = new Set(
    [...source.matchAll(/import\s+\*\s+as\s+([A-Z][A-Za-z0-9_]*)\s+from\s+["'][^"']+["']/g)].map(
      (match) => match[1],
    ),
  );
  const classPattern =
    /(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]*)\b([\s\S]*?)(?=(?:\n|^)\s*(?:export\s+)?class\s+[A-Z][A-Za-z0-9_]*\b|$)/g;
  for (const classMatch of source.matchAll(classPattern)) {
    const className = classMatch[1];
    const classBody = classMatch[2];
    const aliasPattern =
      /(?:^|\n)[\t ]*(?!(?:private|protected)\s+)static\s+(?:readonly\s+)?[A-Za-z_$][\w$]*\s*=\s*([A-Z][A-Za-z0-9_]*)\.[A-Za-z_$][\w$]*/gm;
    for (const aliasMatch of classBody.matchAll(aliasPattern)) {
      if (aliasMatch[1] === className || namespaceImports.has(aliasMatch[1])) continue;
      report(
        path,
        lineNumber(source, classMatch.index + classMatch[0].indexOf(aliasMatch[0])),
        "internal classes must not forward a static domain surface; use the owning domain directly or a named .export.ts facade.",
      );
    }
  }
};

const publicSurfaceExceptions = new Map([
  ["./advanced/xstate", "explicit advanced actor integration"],
  ["./components", "independently consumable React view primitives"],
  ["./components/styled", "independently consumable React recipes"],
  ["./contract", "independently consumable HTTP schemas and groups"],
  ["./react", "React provider and hook composition"],
  ["./web", "independently consumable generic web views and policies"],
]);

const collectPublicValueExports = (source) => {
  const names = new Set();
  for (const match of source.matchAll(
    /(?:^|\n)\s*export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*export\s*\{([\s\S]*?)\}\s*;/g)) {
    for (const item of match[1].split(",")) {
      const name = item
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name !== undefined && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
};

const ambientDependencyPatterns = [
  {
    expression:
      /Date\.now\s*\(\s*\)|new\s+Date\s*\(\s*\)|Math\.random\s*\(|crypto\.randomUUID\s*\(/g,
    message:
      "actor and use-case code must receive time and identity through injected dependencies, not ambient clocks or randomness.",
  },
  {
    expression: /(?:^|[^\w.])(?:window|document|navigator|localStorage|sessionStorage)\s*\./g,
    message:
      "actor and use-case code must receive transport and browser capabilities through injected dependencies.",
  },
];

const main = async () => {
  const coreSource = join(repositoryRoot, "packages/core/src");
  const allSourceRoots = [join(repositoryRoot, "apps"), join(repositoryRoot, "packages")];
  const sourceFilesByRoot = [];
  for (const path of allSourceRoots) {
    if (await existing(path)) sourceFilesByRoot.push(await filesUnder(path));
  }
  const allSourceFiles = sourceFilesByRoot.flat();
  const coreSourceFiles = await filesUnder(coreSource);

  for (const path of allSourceFiles) {
    if (path.endsWith("/index.ts") || path.endsWith("/index.tsx")) {
      report(
        path,
        1,
        "implementation files must not be index.ts barrels; flatten the module or name the boundary.",
      );
    }
    await scanText(path, [
      {
        expression: /(?:from\s+|import\s*\(\s*)["'][^"']*\/(?:index\.ts|index\.tsx)["']/g,
        message:
          "do not import an index.ts module; import the named implementation or .export.ts boundary.",
      },
      {
        expression: /export\s+\*/g,
        message: "wildcard exports hide the public contract; bind each exported symbol explicitly.",
      },
      {
        expression: /export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']/g,
        message: "symbols must be imported and owned locally; export-from forwarding is forbidden.",
      },
      {
        expression: /export\s+(?:const|function)\s+validate(?:Stored)?UIMessagesEffect\b/g,
        message:
          "UI message validation belongs under the Chat.messages domain; do not expose flat validation helpers.",
      },
    ]);
    if (!path.endsWith(".export.ts") && path.includes("/src/")) await scanForwardingClasses(path);
    if (path.includes("/src/") && !path.endsWith(".export.ts")) {
      await scanText(path, [
        {
          expression: /(?:from\s+|import\s*\(\s*)["'][.]{1,2}\/[^"']+\.export\.ts["']/g,
          message:
            "internal modules must not import a package .export.ts boundary; import the named implementation file.",
        },
      ]);
    }
    if (!path.includes("/test/fixtures/rewrite-gates/")) {
      await scanText(path, [
        {
          expression: /["']@emi\/core(?:\/src|\/dist)(?:\/|["'])/g,
          message:
            "consumers must use a named package export, never @emi/core/src or @emi/core/dist.",
        },
      ]);
    }
  }

  if (await existing(join(repositoryRoot, "packages/core-migration"))) {
    report(
      join(repositoryRoot, "packages/core-migration"),
      1,
      "@emi/core-migration is retired; migrate consumers to a named @emi/core boundary and delete the package.",
    );
  }

  for (const path of coreSourceFiles) {
    await scanText(path, [
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
        message:
          "@emi/core-migration is retired; use a named @emi/core boundary or product package.",
      },
    ]);
  }

  const genericContractPaths = [
    join(coreSource, "protocol"),
    join(coreSource, "server/ports"),
    join(coreSource, "server/use-cases"),
    join(coreSource, "server.export.ts"),
    join(coreSource, "server-effect.export.ts"),
    join(coreSource, "server-fetch.export.ts"),
  ];
  const genericContractFiles = [];
  for (const path of genericContractPaths) {
    if (!(await existing(path))) continue;
    if (path.endsWith(".ts")) {
      genericContractFiles.push(path);
      continue;
    }
    genericContractFiles.push(...(await filesUnder(path)));
  }
  for (const path of genericContractFiles) {
    await scanText(path, [
      {
        expression:
          /["'](?:drizzle-orm|kysely|kysely-d1|@cloudflare\/workers-types|ai|@ai-sdk\/[^"']+)(?:\/|["'])/g,
        message:
          "generic protocol/server contracts cannot expose database, platform, or AI SDK types; keep those in adapters or the advanced database boundary.",
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
          expression: /\bconstructor\s*\(\s*[^)]/g,
          message:
            "server and adapter dependencies must be Effect Context services composed by Layer, not constructor DI.",
        },
      ]);
    }
  }

  const deterministicPaths = [
    join(coreSource, "runtime"),
    join(coreSource, "web/chat-runtime"),
    join(coreSource, "server/ports"),
    join(coreSource, "server/use-cases"),
    join(coreSource, "server/db"),
  ];
  for (const directory of deterministicPaths) {
    for (const path of await filesUnder(directory)) await scanText(path, ambientDependencyPatterns);
  }

  for (const path of await filesUnder(join(coreSource, "server/db"))) {
    await scanText(path, [
      {
        expression: /\bEffect\.promise\s*\(/g,
        message:
          "fallible database operations must use QueryDatabase.tryPromise or another tagged Effect.tryPromise boundary; Effect.promise erases the query failure channel.",
      },
    ]);
  }

  const queryDatabasePath = join(coreSource, "server/db/query-database.ts");
  const queryDatabaseSource = await readFile(queryDatabasePath, "utf8");
  const queryDatabaseClient = queryDatabaseSource.match(
    /export interface QueryDatabaseClient[\s\S]*?\n}\n/,
  )?.[0];
  if (queryDatabaseClient === undefined || !queryDatabaseClient.includes("DatabaseQueryError")) {
    report(
      queryDatabasePath,
      1,
      "QueryDatabaseClient must expose a tagged DatabaseQueryError failure channel instead of never.",
    );
  }

  for (const path of [
    join(repositoryRoot, "apps/chat/components/chat/message-rail.tsx"),
    join(repositoryRoot, "apps/chat/hooks/use-thread-viewport-scroll.ts"),
    join(repositoryRoot, "apps/chat/lib/chat-thread-scroll.ts"),
  ]) {
    if (await existing(path)) report(path, 1, "generic chat UI/runtime code belongs in @emi/core.");
  }

  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, "packages/core/package.json"), "utf8"),
  );
  for (const [entrypoint, source] of Object.entries(packageJson.emi.publicApi.entrypointPaths)) {
    if (entrypoint === "./styles.css") continue;
    if (!source.endsWith(".export.ts")) {
      report(
        join(repositoryRoot, "packages/core/package.json"),
        1,
        `${entrypoint} must point to a named .export.ts public boundary, received ${source}.`,
      );
    }
    const publicSourcePath = join(repositoryRoot, "packages/core", source);
    if (!(await existing(publicSourcePath))) continue;
    const publicSource = await readFile(publicSourcePath, "utf8");
    const valueExports = collectPublicValueExports(publicSource);
    if (valueExports.size > 6 && !publicSurfaceExceptions.has(entrypoint)) {
      report(
        publicSourcePath,
        1,
        `${entrypoint} exposes ${valueExports.size} runtime bindings; group related operations under a named domain owner.`,
      );
    }
    if (entrypoint === "./web") {
      const rawActorImport =
        /from\s+["'][^"']*(?:xstate|chat-runtime\/[^"']*(?:actor|machine))[^"]*["']/;
      if (rawActorImport.test(publicSource)) {
        report(
          publicSourcePath,
          1,
          "@emi/core/web is a view boundary; raw XState actors and machines belong only in @emi/core/advanced/xstate.",
        );
      }
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
