import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = dirname(rootDirectory);
const workerOrigin = "http://127.0.0.1:8787";
const withGenericAuthOrigin = (contents) => {
  const lines = contents
    .split("\n")
    .filter((line) => line.startsWith("BETTER_AUTH_SECRET="));
  lines.push("BETTER_AUTH_URL=http://localhost:3233");
  return `${lines.join("\n")}\n`;
};

const createWorkerEnvironmentFile = async () => {
  const rootEnvPath = join(repositoryDirectory, ".env");
  const source = await readFile(rootEnvPath, "utf8");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "emi-generic-worker-"));
  const environmentFile = join(temporaryDirectory, ".env");
  await writeFile(environmentFile, withGenericAuthOrigin(source));
  return { environmentFile, temporaryDirectory };
};

const spawnProcess = ({ command, arguments: commandArguments, environment }) =>
  spawn(command, commandArguments, {
    cwd: repositoryDirectory,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });

const waitForWorker = async ({ timeoutMs = 120_000 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${workerOrigin}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Generic Worker did not become healthy at ${workerOrigin}.`);
};

const stop = (child) => {
  if (child !== undefined && child.exitCode === null) child.kill("SIGTERM");
};

const run = async () => {
  const { environmentFile, temporaryDirectory } = await createWorkerEnvironmentFile();
  const worker = spawnProcess({
    command: "pnpm",
    arguments: [
      "--dir",
      "apps/generic-worker",
      "exec",
      "alchemy",
      "dev",
      "--env-file",
      environmentFile,
    ],
    environment: { ALCHEMY_STAGE: `generic-local-${process.pid}` },
  });
  let web;
  const cleanup = () => {
    stop(web);
    stop(worker);
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  try {
    await waitForWorker();
    web = spawnProcess({
      command: "pnpm",
      arguments: ["--dir", "apps/generic-web", "dev"],
      environment: { VITE_WORKER_ORIGIN: workerOrigin },
    });
    const exitCode = await new Promise((resolve) => {
      web.once("exit", (code, signal) => resolve(code ?? (signal === null ? 1 : 0)));
      worker.once("exit", (code) => {
        if (web?.exitCode === null) web.kill("SIGTERM");
        resolve(code ?? 1);
      });
    });
    process.exitCode = exitCode;
  } finally {
    cleanup();
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
};

await run();
