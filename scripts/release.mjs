import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const productionReleaseHistoryUrl = "https://emi-healthfit.astahmer.dev/release-history.json";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const run = ({ command, args }) =>
  execFileSync(command, args, { cwd: rootDirectory, encoding: "utf8" }).trim();

const runPnpm = ({ args, env = process.env }) => {
  const result = spawnSync(pnpm, args, { cwd: rootDirectory, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const currentRevision = () => {
  const [commitId, changeId] = run({
    command: "jj",
    args: ["log", "--no-graph", "-r", "@-", "-T", 'commit_id ++ "\\n" ++ change_id'],
  }).split("\n");
  if (commitId === undefined || changeId === undefined)
    throw new Error("Could not resolve JJ revision.");
  return { commitId, changeId };
};

const releaseChanges = ({ previousCommitId }) => {
  const revision =
    previousCommitId === undefined ? "@-" : `ancestors(@-) ~ ancestors(${previousCommitId})`;
  const output = run({
    command: "jj",
    args: ["log", "--no-graph", "-r", revision, "-T", 'description.first_line() ++ "\\n"'],
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== "wip");
};

const isRelease = (value) =>
  value !== null &&
  typeof value === "object" &&
  typeof value.version === "string" &&
  typeof value.releasedAt === "string" &&
  typeof value.commitId === "string" &&
  typeof value.changeId === "string" &&
  Array.isArray(value.changes) &&
  value.changes.every((change) => typeof change === "string");

const previousHistory = async () => {
  try {
    const response = await fetch(productionReleaseHistoryUrl, { cache: "no-store" });
    if (!response.ok) return [];
    const value = await response.json();
    if (value === null || typeof value !== "object" || !("releases" in value)) return [];
    if (!Array.isArray(value.releases) || !value.releases.every(isRelease)) return [];
    return value.releases;
  } catch {
    return [];
  }
};

const packageVersion = () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(rootDirectory, "apps/chat/package.json"), "utf8"),
  );
  if (typeof packageJson.version !== "string") throw new Error("Chat package version is missing.");
  return packageJson.version;
};

const productionDatabase = () => {
  const databases = JSON.parse(
    run({
      command: pnpm,
      args: [
        "--dir",
        "apps/api",
        "exec",
        "wrangler",
        "d1",
        "list",
        "--json",
        "--env-file",
        "../../.env.prod",
      ],
    }),
  );
  const database = databases.find(
    (candidate) =>
      typeof candidate.name === "string" &&
      candidate.name.startsWith("emi-healthfit-GymData-prod-"),
  );
  if (database === undefined) throw new Error("Could not find the production GymData database.");
  return database.name;
};

const assertProductionMigrations = () => {
  const journal = JSON.parse(
    readFileSync(resolve(rootDirectory, "apps/api/migrations/meta/_journal.json"), "utf8"),
  );
  const generatedMigrations = journal.entries.map((entry) => `${entry.tag}.sql`);
  const database = productionDatabase();
  const result = JSON.parse(
    run({
      command: pnpm,
      args: [
        "--dir",
        "apps/api",
        "exec",
        "wrangler",
        "d1",
        "execute",
        database,
        "--remote",
        "--command",
        "SELECT name FROM d1_migrations",
        "--json",
        "--yes",
        "--env-file",
        "../../.env.prod",
      ],
    }),
  );
  const applied = new Set(
    result.flatMap((command) => command.results ?? []).map((row) => row.name),
  );
  const latestApplied = generatedMigrations.filter((name) => applied.has(name)).at(-1);
  const pending = generatedMigrations.filter(
    (name) => (latestApplied === undefined || name > latestApplied) && !applied.has(name),
  );
  if (pending.length > 0) {
    throw new Error(`Apply production D1 migrations before release: ${pending.join(", ")}`);
  }
};

runPnpm({ args: ["release:check"] });
assertProductionMigrations();

if (run({ command: "jj", args: ["diff", "--from", "@-", "--to", "@", "--summary"] }) !== "") {
  throw new Error("Commit the release before deploying so the JJ revision is stable.");
}

const revision = currentRevision();
const releasedAt = new Date().toISOString();
const version = `${packageVersion()}-${releasedAt.slice(0, 16).replace("T", "-").replace(":", "-")}`;
const history = await previousHistory();
const changes = releaseChanges({ previousCommitId: history[0]?.commitId });
const release = { version, releasedAt, ...revision, changes };
const releases = [release, ...history.filter((entry) => entry.commitId !== revision.commitId)];

runPnpm({
  args: ["--filter", "@emi/api", "deploy:prod"],
  env: {
    ...process.env,
    EMI_BUILD_ID: revision.commitId.slice(0, 12),
    EMI_CHANGE_ID: revision.changeId,
    EMI_COMMIT_ID: revision.commitId,
    EMI_RELEASED_AT: releasedAt,
    EMI_RELEASE_VERSION: version,
    EMI_RELEASE_HISTORY: JSON.stringify({ releases }),
  },
});
