import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const productionReleaseHistoryUrl = "https://emi-healthfit.astahmer.dev/release-history.json";

const run = ({ command, args }) =>
  execFileSync(command, args, { cwd: rootDirectory, encoding: "utf8" }).trim();

const runPnpm = ({ args }) => {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpm, args, { cwd: rootDirectory, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
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

const releaseChanges = ({ previousCommitId, commitId }) => {
  const range =
    previousCommitId === undefined ? ["-n", "1", commitId] : [`${previousCommitId}..${commitId}`];
  const result = spawnSync("git", ["log", "--format=%s", ...range], {
    cwd: rootDirectory,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("Could not resolve release changes from Git history.");
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== "wip");
};

const assertReleaseTarget = ({ releaseTag, commitId }) => {
  if (!/^release-\d{8}-\d{6}$/.test(releaseTag)) {
    throw new Error(`Unsupported release tag ${releaseTag}; expected release-YYYYMMDD-HHmmss.`);
  }
  const tagCommit = run({
    command: "git",
    args: ["rev-list", "-n", "1", `refs/tags/${releaseTag}`],
  });
  if (tagCommit !== commitId)
    throw new Error("The checked-out commit does not match the release tag.");
  const mainCommit = run({ command: "git", args: ["rev-parse", "origin/main"] });
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", commitId, mainCommit], {
    cwd: rootDirectory,
    stdio: "ignore",
  });
  if (ancestry.status !== 0)
    throw new Error("Production release tags must point to a revision reachable from main.");
};

const runDeployment = ({ environment }) => {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpm, ["--filter", "@emi/api", "deploy:prod"], {
    cwd: rootDirectory,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const main = async () => {
  const releaseTag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
  if (releaseTag === undefined) throw new Error("RELEASE_TAG is required.");
  const commitId = run({ command: "git", args: ["rev-parse", "HEAD"] });
  assertReleaseTarget({ releaseTag, commitId });

  const releasedAt = process.env.RELEASED_AT ?? new Date().toISOString();
  const version = `${packageVersion()}-${releaseTag.slice("release-".length)}`;
  const changeId =
    /<!-- emi-jj-change-id: ([a-z0-9]+) -->/.exec(process.env.RELEASE_BODY ?? "")?.[1] ??
    releaseTag;
  const history = await previousHistory();
  const changes = releaseChanges({ previousCommitId: history[0]?.commitId, commitId });
  const releases = [
    {
      version,
      releasedAt,
      commitId,
      changeId,
      changes,
    },
    ...history.filter((entry) => entry.commitId !== commitId),
  ];
  const environment = {
    ...process.env,
    EMI_BUILD_ID: commitId.slice(0, 12),
    EMI_CHANGE_ID: changeId,
    EMI_COMMIT_ID: commitId,
    EMI_RELEASED_AT: releasedAt,
    EMI_RELEASE_VERSION: version,
    EMI_RELEASE_HISTORY: JSON.stringify({ releases }),
  };

  if (process.argv.includes("--dry-run")) {
    console.log(
      JSON.stringify({ releaseTag, version, releasedAt, commitId, changeId, changes }, null, 2),
    );
    return;
  }
  runPnpm({ args: ["--filter", "@emi/api", "db:verify:prod"] });
  runDeployment({ environment });
};

await main();
