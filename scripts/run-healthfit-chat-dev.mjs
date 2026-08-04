import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = dirname(rootDirectory);
const apiOrigin = "http://127.0.0.1:1337";
const webOrigin = "http://127.0.0.1:3232";
const apiEnvironmentKeys = new Set([
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ALLOWED_EMAILS",
  "HEVY_CREDENTIAL_ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "DISCORD_INTERNAL_ASK_SECRET",
]);

const createEnvironmentFile = async () => {
  const source = await readFile(join(repositoryDirectory, ".env"), "utf8");
  const lines = source.split("\n").filter((line) => {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) return false;
    const key = line.slice(0, separatorIndex).trim();
    return apiEnvironmentKeys.has(key) && key !== "BETTER_AUTH_URL";
  });
  lines.push(`BETTER_AUTH_URL=${webOrigin}`);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "emi-healthfit-chat-"));
  const environmentFile = join(temporaryDirectory, ".env");
  await writeFile(environmentFile, `${lines.join("\n")}\n`);
  return { environmentFile, temporaryDirectory };
};

const spawnProcess = ({ arguments: commandArguments, environment = {} }) =>
  spawn("pnpm", commandArguments, {
    cwd: repositoryDirectory,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });

const waitForApi = async ({ timeoutMs = 120_000 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiOrigin}/api/auth/get-session`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`HealthFit API did not become healthy at ${apiOrigin}.`);
};

const stop = (child) => {
  if (child !== undefined && child.exitCode === null) child.kill("SIGTERM");
};

const run = async () => {
  const { environmentFile, temporaryDirectory } = await createEnvironmentFile();
  let api;
  let web;
  const cleanup = () => {
    stop(web);
    stop(api);
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  try {
    api = spawnProcess({
      arguments: ["--dir", "apps/api", "alchemy", "dev", "dev", "--env-file", environmentFile],
    });
    await waitForApi();
    web = spawnProcess({
      arguments: ["--dir", "apps/chat", "dev"],
      environment: { API_BASE_URL: apiOrigin },
    });
    const exitCode = await new Promise((resolve) => {
      let settled = false;
      const finish = (code) => {
        if (settled) return;
        settled = true;
        resolve(code);
      };
      web.once("exit", (code, signal) => {
        stop(api);
        finish(code ?? (signal === null ? 1 : 0));
      });
      api.once("exit", (code) => {
        stop(web);
        finish(code ?? 1);
      });
    });
    process.exitCode = exitCode;
  } finally {
    cleanup();
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
};

await run();
