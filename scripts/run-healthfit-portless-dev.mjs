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
const apiUrl = `${portlessScheme}://emi-healthfit.localhost${portSuffix}`;
const webUrl = `${portlessScheme}://emi-chat.localhost${portSuffix}`;
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
    const key = line.slice(0, line.indexOf("=")).trim();
    return apiEnvironmentKeys.has(key) && !line.startsWith("BETTER_AUTH_URL=");
  });
  lines.push(`BETTER_AUTH_URL=${webUrl}`);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "emi-healthfit-portless-"));
  const environmentFile = join(temporaryDirectory, ".env");
  await writeFile(environmentFile, `${lines.join("\n")}\n`);
  return { environmentFile, temporaryDirectory };
};

const waitForUrl = async ({ url, timeoutMs = 120_000 }) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const statusCode = await new Promise((resolve, reject) => {
        const requestOptions = new URL(url);
        const requestHandle = (portlessHttps ? httpsRequest : httpRequest)(
          requestOptions,
          portlessHttps ? { rejectUnauthorized: false } : {},
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 500);
          },
        );
        requestHandle.on("error", reject);
        requestHandle.end();
      });
      if (statusCode === 200) return;
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
  const api = spawn(
    "pnpm",
    [
      "exec",
      "portless",
      "--name",
      "emi-healthfit",
      "--app-port",
      "1337",
      "--",
      "pnpm",
      "--dir",
      "apps/api",
      "alchemy",
      "dev",
      "dev",
      "--env-file",
      environmentFile,
    ],
    {
      cwd: repositoryDirectory,
      env: { ...process.env },
      stdio: "inherit",
    },
  );
  const cleanup = () => stop(api);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  try {
    await waitForUrl({ url: `${apiUrl}/api/auth/get-session` });
    console.log(`HealthFit is available at ${apiUrl}`);
    await new Promise((resolve) => api.once("exit", resolve));
  } finally {
    cleanup();
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
};

await run();
