import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const runOxlint = (paths) =>
  spawnSync("pnpm", ["exec", "oxlint", "--config", ".oxlintrc.json", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

const assertExit = (result, expected, description) => {
  if (result.status === expected) return;
  throw new Error(
    `${description} expected exit ${expected}, received ${result.status}.\n${result.stdout ?? ""}${result.stderr ?? ""}`,
  );
};

const fixture = async (name) =>
  readFile(join(repositoryRoot, "anti-slop/tests/oxlint", name), "utf8");

const main = async () => {
  // Fixtures live outside the repository so oxlint still lints them (it skips
  // gitignored paths) without ever showing up in the JJ working copy.
  const temporaryRoot = await mkdtemp(join(tmpdir(), "antislop-oxlint-"));
  try {
    const coreDirectory = join(temporaryRoot, "packages/core/src");
    const validAbstractPath = join(coreDirectory, "valid-domain.ts");
    const invalidAbstractPath = join(coreDirectory, "invalid-domain.ts");
    await mkdir(coreDirectory, { recursive: true });
    await writeFile(validAbstractPath, await fixture("no-abstract-domain-class.valid.ts"));
    await writeFile(invalidAbstractPath, await fixture("no-abstract-domain-class.invalid.ts"));
    assertExit(runOxlint([validAbstractPath]), 0, "valid abstract-domain fixture");
    assertExit(runOxlint([invalidAbstractPath]), 1, "invalid abstract-domain fixture");

    const protocolDirectory = join(temporaryRoot, "packages/core/src/protocol");
    const validProtocolPath = join(protocolDirectory, "valid-contract.ts");
    const invalidProtocolPath = join(protocolDirectory, "invalid-contract.ts");
    await mkdir(protocolDirectory, { recursive: true });
    await writeFile(validProtocolPath, await fixture("no-generic-platform-import.valid.ts"));
    await writeFile(invalidProtocolPath, await fixture("no-generic-platform-import.invalid.ts"));
    assertExit(
      runOxlint([validProtocolPath]),
      0,
      `valid generic-contract fixture ${relative(repositoryRoot, validProtocolPath)}`,
    );
    assertExit(
      runOxlint([invalidProtocolPath]),
      1,
      `invalid generic-contract fixture ${relative(repositoryRoot, invalidProtocolPath)}`,
    );

    const effectDirectory = join(temporaryRoot, "packages/core/src/server/ports");
    const effectFixtures = [
      ["no-effect-context-reprovide", "context"],
      ["no-catch-if-tagged-error", "catch"],
      ["no-service-flat-map-facade", "flat-map"],
      ["no-effect-service-argument", "service-argument"],
      ["no-untyped-readable-stream-error", "stream-error"],
    ];
    await mkdir(effectDirectory, { recursive: true });
    for (const [fixtureName, suffix] of effectFixtures) {
      const validEffectPath = join(effectDirectory, `valid-effect-${suffix}.ts`);
      const invalidEffectPath = join(effectDirectory, `invalid-effect-${suffix}.ts`);
      await writeFile(validEffectPath, await fixture(`${fixtureName}.valid.ts`));
      await writeFile(invalidEffectPath, await fixture(`${fixtureName}.invalid.ts`));
      assertExit(
        runOxlint([validEffectPath]),
        0,
        `valid ${fixtureName} fixture ${relative(repositoryRoot, validEffectPath)}`,
      );
      assertExit(
        runOxlint([invalidEffectPath]),
        1,
        `invalid ${fixtureName} fixture ${relative(repositoryRoot, invalidEffectPath)}`,
      );
    }

    const databaseDirectory = join(temporaryRoot, "packages/core/src/server/db");
    const validDatabasePath = join(databaseDirectory, "valid-database-promise.ts");
    const invalidDatabasePath = join(databaseDirectory, "invalid-database-promise.ts");
    await mkdir(databaseDirectory, { recursive: true });
    await writeFile(validDatabasePath, await fixture("no-fallible-database-promise.valid.ts"));
    await writeFile(invalidDatabasePath, await fixture("no-fallible-database-promise.invalid.ts"));
    assertExit(
      runOxlint([validDatabasePath]),
      0,
      `valid database promise fixture ${relative(repositoryRoot, validDatabasePath)}`,
    );
    assertExit(
      runOxlint([invalidDatabasePath]),
      1,
      `invalid database promise fixture ${relative(repositoryRoot, invalidDatabasePath)}`,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const sourcePaths = [
    "packages/core/src/server/ports",
    "packages/core/src/server/use-cases",
    "packages/core/src/protocol",
    "packages/core/src/contract",
    "packages/core/src/server/db",
    "packages/core/src/cloudflare",
    "apps/api/src",
  ];
  assertExit(runOxlint(sourcePaths), 0, "generic core Oxlint anti-slop scan");
  console.log("Oxlint anti-slop plugin checks passed.");
};

await main();
