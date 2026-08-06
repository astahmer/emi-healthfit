import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { request as httpRequest } from "node:http";

const rootDirectory = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const require = createRequire(import.meta.url);
const playwrightPath = fileURLToPath(import.meta.resolve("@playwright/test/cli"));
const configPath = join(rootDirectory, "apps/chat/playwright.worker.config.ts");
const bddgenPath = join(
  dirname(require.resolve("playwright-bdd/package.json")),
  "dist/cli/index.js",
);
const apiPort = process.env.WORKER_E2E_API_PORT ?? "1337";
const webPort = process.env.WORKER_E2E_WEB_PORT ?? "3232";
const providerPort = process.env.PROVIDER_PORT ?? "1399";
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const providerUrl = `http://127.0.0.1:${providerPort}`;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const apiEnvironmentKeys = new Set([
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ALLOWED_EMAILS",
  "HEVY_CREDENTIAL_ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "DISCORD_INTERNAL_ASK_SECRET",
]);

if (process.env.RELEASE_SKIP_WORKER_E2E === "1") {
  console.log("Skipping real Worker E2E (RELEASE_SKIP_WORKER_E2E=1).");
  process.exit(0);
}

const assertPortsAvailable = async () => {
  const ports = [apiPort, webPort, providerPort];
  const inUse = (
    await Promise.all(
      ports.map(
        (port) =>
          new Promise((resolve) => {
            const socket = createConnection({ host: "127.0.0.1", port: Number(port) });
            socket.once("connect", () => {
              socket.destroy();
              resolve(port);
            });
            socket.once("error", () => resolve(null));
          }),
      ),
    )
  ).filter((port) => port !== null);
  if (inUse.length > 0) {
    throw new Error(
      `Real Worker E2E needs ports ${ports.join(", ")} but ${inUse.join(", ")} is already in use. ` +
        "Stop the occupying dev servers, override WORKER_E2E_API_PORT/WORKER_E2E_WEB_PORT/PROVIDER_PORT, " +
        "or set RELEASE_SKIP_WORKER_E2E=1.",
    );
  }
};

const createEnvironmentFile = async () => {
  const environmentPath = join(rootDirectory, ".env");
  let source;
  try {
    source = await readFile(environmentPath, "utf8");
  } catch {
    throw new Error(
      `Real Worker E2E requires ${environmentPath} (copy .env.example) ` +
        "or set RELEASE_SKIP_WORKER_E2E=1.",
    );
  }
  const lines = source.split("\n").filter((line) => {
    const separatorIndex = line.indexOf("=");
    return separatorIndex > 0 && apiEnvironmentKeys.has(line.slice(0, separatorIndex).trim());
  });
  lines.push(`BETTER_AUTH_URL=${webUrl}`);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "emi-healthfit-worker-e2e-"));
  const environmentFile = join(temporaryDirectory, ".env");
  await writeFile(environmentFile, `${lines.join("\n")}\n`);
  return { environmentFile, temporaryDirectory };
};

const spawnProcess = ({ command, arguments: commandArguments, environment, cwd = rootDirectory }) =>
  spawn(command, commandArguments, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: "inherit",
    detached: true,
  });

const waitForStatus = async ({ url, timeoutMs = 180_000 }) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const statusCode = await new Promise((resolve, reject) => {
        const request = httpRequest(url, (response) => {
          response.resume();
          resolve(response.statusCode ?? 500);
        });
        request.on("error", reject);
        request.end();
      });
      if (statusCode === 200) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Worker service did not become healthy at ${url}.`);
};

const waitForChild = ({ child }) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
};

const stopChild = async ({ child }) => {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const exit = waitForChild({ child });
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  const stopped = await Promise.race([exit.then(() => true), delay(2_000).then(() => false)]);
  if (!stopped) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    await exit;
  }
};

const run = async () => {
  await assertPortsAvailable();
  const { environmentFile, temporaryDirectory } = await createEnvironmentFile();
  let api;
  let web;
  let provider;
  let playwright;
  const cleanup = async () => {
    await stopChild({ child: playwright });
    await stopChild({ child: web });
    await stopChild({ child: provider });
    await stopChild({ child: api });
  };
  process.once("SIGINT", () => void cleanup());
  process.once("SIGTERM", () => void cleanup());

  try {
    provider = spawnProcess({
      command: process.execPath,
      arguments: [new URL("../e2e/mock/provider-server.mjs", import.meta.url).pathname],
      environment: { PROVIDER_PORT: providerPort },
    });
    await waitForStatus({ url: `${providerUrl}/health`, timeoutMs: 30_000 });

    api = spawnProcess({
      command: process.execPath,
      arguments: ["scripts/run-alchemy.mjs", "dev", "--env-file", environmentFile],
      environment: { EMI_API_DEV_PORT: apiPort },
      cwd: join(rootDirectory, "apps/api"),
    });
    await waitForStatus({ url: `${apiUrl}/api/auth/get-session` });

    web = spawnProcess({
      command: join(rootDirectory, "apps/chat/node_modules/.bin/vite"),
      arguments: ["--host", "127.0.0.1", "--port", webPort],
      environment: {
        API_BASE_URL: apiUrl,
        PORT: webPort,
      },
      cwd: join(rootDirectory, "apps/chat"),
    });
    await waitForStatus({ url: `${webUrl}/auth` });

    const bddgen = spawn(process.execPath, [bddgenPath, "--config", configPath], {
      cwd: join(rootDirectory, "apps/chat"),
      stdio: "inherit",
    });
    await waitForChild({ child: bddgen });

    playwright = spawnProcess({
      command: process.execPath,
      arguments: [playwrightPath, "test", "--config", configPath, ...process.argv.slice(2)],
      environment: { E2E_BASE_URL: webUrl, HEALTHFIT_REAL_WORKER: "1" },
    });
    const result = await waitForChild({ child: playwright });
    process.exitCode = result.code ?? 1;
  } finally {
    await cleanup();
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
};

await run();
