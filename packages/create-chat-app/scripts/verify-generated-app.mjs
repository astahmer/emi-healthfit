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
  await run({ command: "pnpm", args: ["install"], cwd: targetDirectory });
  await run({ command: "pnpm", args: ["typecheck"], cwd: targetDirectory });
  await run({ command: "pnpm", args: ["--dir", "worker", "db:generate"], cwd: targetDirectory });
  await run({ command: "pnpm", args: ["--dir", "worker", "db:check"], cwd: targetDirectory });
  await run({ command: "pnpm", args: ["--dir", "web", "build"], cwd: targetDirectory });

  let worker;
  let web;
  try {
    worker = startServer({
      command: "pnpm",
      args: ["--dir", "worker", "dev"],
      cwd: targetDirectory,
      env: {
        BETTER_AUTH_SECRET: "generated-app-acceptance-secret-1234567890",
        BETTER_AUTH_URL: "http://127.0.0.1:8787",
        AUTH_APP_NAME: "Acceptance Chat",
      },
    });
    web = startServer({
      command: "pnpm",
      args: ["--dir", "web", "dev", "--host", "127.0.0.1"],
      cwd: targetDirectory,
      env: { VITE_WORKER_ORIGIN: "http://127.0.0.1:8787" },
    });
    await waitForUrl({ url: "http://127.0.0.1:8787/api/health", server: worker });
    await waitForUrl({ url: "http://127.0.0.1:3233/api/health", server: web });
    await run({
      command: "pnpm",
      args: ["--dir", "web", "test:api"],
      cwd: targetDirectory,
      env: {
        GENERIC_API_SMOKE_ORIGIN: "http://127.0.0.1:3233",
        GENERIC_EXPECTED_APP_NAME: "Acceptance Chat",
      },
    });
  } finally {
    if (web) await stopServer(web);
    if (worker) await stopServer(worker);
  }
} finally {
  await rm(targetDirectory, { recursive: true, force: true });
}
