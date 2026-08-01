import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = dirname(rootDirectory);
const portlessHttps = process.env.PORTLESS_HTTPS !== "0";
const portlessPort = Number(process.env.PORTLESS_PORT ?? (portlessHttps ? "443" : "80"));
const portlessScheme = portlessHttps ? "https" : "http";
const portSuffix =
  (portlessHttps && portlessPort === 443) || (!portlessHttps && portlessPort === 80)
    ? ""
    : `:${portlessPort}`;
const workerUrl = `${portlessScheme}://generic-worker.localhost${portSuffix}`;
const webUrl = `${portlessScheme}://generic-chat.localhost${portSuffix}`;

const createEnvironmentFile = async () => {
  const source = await readFile(join(repositoryDirectory, ".env"), "utf8");
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.startsWith("BETTER_AUTH_URL="));
  if (index === -1) lines.push(`BETTER_AUTH_URL=${webUrl}`);
  else lines[index] = `BETTER_AUTH_URL=${webUrl}`;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "emi-generic-portless-"));
  const environmentFile = join(temporaryDirectory, ".env");
  await writeFile(environmentFile, lines.join("\n"));
  return { environmentFile, temporaryDirectory };
};

const spawnPortless = ({ name, environment, arguments: commandArguments }) =>
  spawn("pnpm", ["exec", "portless", "--name", name, "--", "pnpm", ...commandArguments], {
    cwd: repositoryDirectory,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });

const waitForUrl = async ({ url, timeoutMs = 120_000 }) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await new Promise((resolve, reject) => {
        const requestOptions = new URL(url);
        const requestHandle = (portlessHttps ? httpsRequest : httpRequest)(
          requestOptions,
          portlessHttps ? { rejectUnauthorized: false } : {},
          (responseValue) => {
            responseValue.resume();
            resolve(responseValue.statusCode ?? 500);
          },
        );
        requestHandle.on("error", reject);
        requestHandle.end();
      });
      if (response === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Portless app did not become healthy at ${url}.`);
};

const stop = (child) => {
  if (child !== undefined && child.exitCode === null) child.kill("SIGTERM");
};

const run = async () => {
  const { environmentFile, temporaryDirectory } = await createEnvironmentFile();
  const worker = spawnPortless({
    name: "generic-worker",
    arguments: [
      "--dir",
      "apps/generic-worker",
      "exec",
      "alchemy",
      "dev",
      "--env-file",
      environmentFile,
    ],
    environment: { ALCHEMY_STAGE: `generic-portless-${process.pid}` },
  });
  let web;
  const cleanup = () => {
    stop(web);
    stop(worker);
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  try {
    await waitForUrl({ url: `${workerUrl}/api/health` });
    web = spawnPortless({
      name: "generic-chat",
      arguments: ["--dir", "apps/generic-web", "exec", "vite", "--mode", "portless"],
      environment: { VITE_WORKER_ORIGIN: workerUrl },
    });
    await waitForUrl({ url: `${webUrl}/api/health` });
    const exitCode = await new Promise((resolve) => {
      web.once("exit", (code, signal) => resolve(code ?? (signal === null ? 1 : 0)));
      worker.once("exit", (code) => {
        stop(web);
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
