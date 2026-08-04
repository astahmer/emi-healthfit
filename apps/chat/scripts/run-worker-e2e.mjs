import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";

const rootDirectory = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const playwrightPath = fileURLToPath(import.meta.resolve("@playwright/test/cli"));
const configPath = join(rootDirectory, "apps/chat/playwright.worker.config.ts");
const processSuffix = `${process.pid}`;
const portlessPort = process.env.PORTLESS_PORT ?? "1355";
const apiName = `emi-healthfit-worker-e2e-${processSuffix}`;
const webName = `emi-chat-worker-e2e-${processSuffix}`;
const portSuffix = portlessPort === "443" ? "" : `:${portlessPort}`;
const apiUrl = `http://${apiName}.localhost${portSuffix}`;
const webUrl = `http://${webName}.localhost${portSuffix}`;
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

const createEnvironmentFile = async () => {
  const source = await readFile(join(rootDirectory, ".env"), "utf8");
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

const spawnProcess = ({ command, arguments: commandArguments, environment }) =>
  spawn(command, commandArguments, {
    cwd: rootDirectory,
    env: { ...process.env, ...environment },
    stdio: "inherit",
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
  child.kill("SIGTERM");
  const stopped = await Promise.race([exit.then(() => true), delay(2_000).then(() => false)]);
  if (!stopped) child.kill("SIGKILL");
  await exit;
};

const run = async () => {
  const { environmentFile, temporaryDirectory } = await createEnvironmentFile();
  let api;
  let web;
  let playwright;
  const cleanup = async () => {
    await stopChild({ child: playwright });
    await stopChild({ child: web });
    await stopChild({ child: api });
  };
  process.once("SIGINT", () => void cleanup());
  process.once("SIGTERM", () => void cleanup());

  try {
    api = spawnProcess({
      command: "pnpm",
      arguments: [
        "exec",
        "portless",
        "--name",
        apiName,
        "--app-port",
        "1337",
        "--",
        "pnpm",
        "--dir",
        "apps/api",
        "alchemy",
        "dev",
        "--stage",
        `healthfit-worker-e2e-${processSuffix}`,
        "--env-file",
        environmentFile,
      ],
      environment: { PORTLESS_PORT: portlessPort, PORTLESS_HTTPS: "0" },
    });
    await waitForStatus({ url: `${apiUrl}/api/auth/get-session` });

    web = spawnProcess({
      command: "pnpm",
      arguments: [
        "exec",
        "portless",
        "--name",
        webName,
        "--app-port",
        "3232",
        "--",
        "pnpm",
        "--dir",
        "apps/chat",
        "exec",
        "vite",
        "--host",
        "127.0.0.1",
        "--port",
        "3232",
      ],
      environment: {
        API_BASE_URL: apiUrl,
        PORT: "3232",
        PORTLESS_PORT: portlessPort,
        PORTLESS_HTTPS: "0",
      },
    });
    await waitForStatus({ url: `${webUrl}/auth` });

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
