import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const run = ({ command, args, cwd, env }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? `code ${code ?? "unknown"}`}.`));
    });
  });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const startServer = ({ command, args, cwd, env }) => {
  const state = { error: undefined, stopping: false };
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  child.once("error", (error) => {
    state.error = error;
  });
  child.once("exit", (code, signal) => {
    if (!state.stopping && code !== 0) {
      state.error = new Error(`${command} exited with ${signal ?? `code ${code ?? "unknown"}`}.`);
    }
  });
  return { child, state };
};

const waitForUrl = async ({ url, server }) => {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.state.error) throw server.state.error;
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${url}.`);
};

const stopServer = async (server) => {
  server.state.stopping = true;
  const processId = server.child.pid;
  if (processId === undefined) return;
  const signalProcessGroup = (signal) => {
    if (process.platform === "win32") {
      server.child.kill(signal);
      return;
    }
    try {
      process.kill(-processId, signal);
    } catch {
      server.child.kill(signal);
    }
  };
  signalProcessGroup("SIGTERM");
  if (server.child.exitCode === null) {
    await Promise.race([new Promise((resolve) => server.child.once("exit", resolve)), wait(5_000)]);
  }
  if (server.child.exitCode === null) signalProcessGroup("SIGKILL");
};

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const targetDirectory = await mkdtemp(join(tmpdir(), "create-chat-app-"));
const alchemyStage = `generated-acceptance-${process.pid}`;
const workerEnvironment = {
  ALCHEMY_STAGE: alchemyStage,
  AUTH_APP_NAME: "Acceptance Chat",
  BETTER_AUTH_SECRET: "generated-app-acceptance-secret-1234567890",
  BETTER_AUTH_URL: "http://127.0.0.1:3233",
};

try {
  await run({
    command: process.execPath,
    args: [
      "--experimental-strip-types",
      "bin/create-chat-app.ts",
      "Acceptance Chat",
      "--dir",
      targetDirectory,
    ],
    cwd: packageDirectory,
  });
  await run({
    command: process.execPath,
    args: [
      "--experimental-strip-types",
      "bin/create-chat-app.ts",
      "upgrade",
      targetDirectory,
      "--dry-run",
    ],
    cwd: packageDirectory,
  });
  await run({ command: "pnpm", args: ["install", "--frozen-lockfile"], cwd: targetDirectory });
  await run({ command: "pnpm", args: ["typecheck"], cwd: targetDirectory });
  await run({ command: "pnpm", args: ["--dir", "worker", "db:generate"], cwd: targetDirectory });
  await run({ command: "pnpm", args: ["--dir", "worker", "db:check"], cwd: targetDirectory });
  await run({ command: "pnpm", args: ["--dir", "web", "build"], cwd: targetDirectory });
  await run({
    command: "pnpm",
    args: ["--dir", "worker", "dry", "--stage", alchemyStage],
    cwd: targetDirectory,
    env: workerEnvironment,
  });

  let worker;
  let web;
  try {
    worker = startServer({
      command: join(targetDirectory, "worker/node_modules/.bin/alchemy"),
      args: ["dev", "--stage", alchemyStage],
      cwd: join(targetDirectory, "worker"),
      env: workerEnvironment,
    });
    web = startServer({
      command: join(targetDirectory, "web/node_modules/.bin/vite"),
      args: ["--port", "3233", "--host", "127.0.0.1"],
      cwd: join(targetDirectory, "web"),
      env: {
        VITE_WEBMCP_ENABLED: "true",
        VITE_WORKER_ORIGIN: "http://127.0.0.1:8787",
      },
    });
    await waitForUrl({ url: "http://127.0.0.1:8787/api/health", server: worker });
    await waitForUrl({ url: "http://127.0.0.1:3233/api/health", server: web });
    await run({
      command: "pnpm",
      args: ["--dir", "web", "test:api"],
      cwd: targetDirectory,
      env: {
        GENERIC_API_ORIGIN: "http://127.0.0.1:3233",
        GENERIC_AUTH_ORIGIN: "http://127.0.0.1:3233",
        GENERIC_EXPECTED_APP_NAME: "Acceptance Chat",
        GENERIC_EXPECTED_APP_VERSION: "0.1.0",
      },
    });
    await run({
      command: "pnpm",
      args: ["--dir", "web", "test:e2e"],
      cwd: targetDirectory,
      env: {
        GENERIC_EXPECTED_APP_NAME: "Acceptance Chat",
        GENERIC_EXPECTED_APP_VERSION: "0.1.0",
        GENERIC_REAL_WORKER: "1",
      },
    });
  } finally {
    if (web) await stopServer(web);
    if (worker) {
      await stopServer(worker);
      await run({
        command: "pnpm",
        args: ["--dir", "worker", "destroy", "--stage", alchemyStage, "--yes"],
        cwd: targetDirectory,
        env: workerEnvironment,
      });
    }
  }
} finally {
  await rm(targetDirectory, { recursive: true, force: true });
}
