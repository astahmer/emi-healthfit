import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));

const run = ({ command, args }) =>
  execFileSync(command, args, { cwd: rootDirectory, encoding: "utf8" }).trim();

const runPnpm = ({ args }) => {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpm, args, { cwd: rootDirectory, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const releaseCommit = () => {
  const workingCopyChanges = run({
    command: "jj",
    args: ["diff", "--from", "@-", "--to", "@", "--summary"],
  });
  if (workingCopyChanges !== "") {
    throw new Error(
      "Release tags require a clean working copy; commit or abandon the changes first.",
    );
  }

  const commitId = run({
    command: "jj",
    args: ["log", "--no-graph", "-r", "@-", "-T", "commit_id"],
  });
  run({ command: "git", args: ["fetch", "origin", "main", "--no-tags"] });
  const mainCommit = run({ command: "git", args: ["rev-parse", "FETCH_HEAD"] });
  if (commitId !== mainCommit) {
    throw new Error(
      `Release tags must point to the current origin/main head (${mainCommit.slice(0, 12)}).`,
    );
  }
  return commitId;
};

const releaseRevision = () => {
  const [commitId, changeId] = run({
    command: "jj",
    args: ["log", "--no-graph", "-r", "@-", "-T", 'commit_id ++ "\\n" ++ change_id'],
  }).split("\n");
  if (commitId === undefined || changeId === undefined) {
    throw new Error("Could not resolve the JJ release revision.");
  }
  return { commitId, changeId };
};

const isoTimestamp = new Date().toISOString();
const timestamp = `${isoTimestamp.slice(0, 10).replaceAll("-", "")}-${isoTimestamp
  .slice(11, 19)
  .replaceAll(":", "")}`;
const tag = `release-${timestamp}`;
const { commitId, changeId } = releaseRevision();
if (releaseCommit() !== commitId) {
  throw new Error("JJ release revision changed while preparing the tag.");
}

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ tag, commitId, changeId }, null, 2));
  process.exit(0);
}

if (process.env.RELEASE_SKIP_HANDOFF !== "1") runPnpm({ args: ["check:handoff"] });

const result = spawnSync(
  "gh",
  [
    "release",
    "create",
    tag,
    "--target",
    commitId,
    "--notes",
    `<!-- emi-jj-change-id: ${changeId} -->\n\nDeployed commit: ${commitId}\nJJ change: ${changeId}\n\nThis release deploys the current main revision.`,
    "--title",
    `HealthFit ${tag}`,
    "--latest",
  ],
  { cwd: rootDirectory, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
