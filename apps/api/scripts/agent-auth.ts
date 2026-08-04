import { chmod, mkdir, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const AgentResponse = z.object({
  expiresAt: z.string().datetime(),
  user: z.object({
    email: z.string().email(),
    id: z.string().min(1),
    name: z.string().min(1),
  }),
});

const parseArguments = (arguments_: string[]) => {
  const options: {
    cookieDomain?: string;
    envFile: string;
    output: string;
  } = {
    envFile: ".env",
    output: "apps/api/.local/agent-session.json",
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--environment-file") {
      options.envFile = arguments_[index + 1] ?? options.envFile;
      index += 1;
      continue;
    }
    if (argument === "--output") {
      options.output = arguments_[index + 1] ?? options.output;
      index += 1;
      continue;
    }
    if (argument === "--cookie-domain") {
      options.cookieDomain = arguments_[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
};

const cookiePairFrom = (setCookie: string | null): { name: string; value: string } => {
  const cookiePair = setCookie?.split(";", 1)[0];
  const separator = cookiePair?.indexOf("=") ?? -1;
  if (cookiePair === undefined || separator < 1) {
    throw new Error("Agent auth response did not set a session cookie.");
  }
  return {
    name: cookiePair.slice(0, separator),
    value: cookiePair.slice(separator + 1),
  };
};

const run = async () => {
  const options = parseArguments(process.argv.slice(2));
  loadEnvFile(resolve(workspaceRoot, options.envFile));
  const baseUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  const secret = process.env.AGENT_AUTH_SECRET;
  if (baseUrl === undefined || secret === undefined) {
    throw new Error("BETTER_AUTH_URL and AGENT_AUTH_SECRET must be configured.");
  }

  const response = await fetch(`${baseUrl}/api/auth/sign-in/agent`, {
    headers: {
      authorization: `Bearer ${secret}`,
      origin: baseUrl,
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Agent auth failed (${response.status}): ${await response.text()}`);
  }
  const payload = AgentResponse.parse(await response.json());
  const cookie = cookiePairFrom(response.headers.get("set-cookie"));
  const baseUrlObject = new URL(baseUrl);
  const state = {
    cookies: [
      {
        domain: options.cookieDomain ?? baseUrlObject.hostname,
        expires: Math.floor(Date.parse(payload.expiresAt) / 1000),
        httpOnly: true,
        name: cookie.name,
        path: "/",
        sameSite: "Lax",
        secure: baseUrlObject.protocol === "https:",
        value: cookie.value,
      },
    ],
    origins: [],
  };
  const outputPath = resolve(workspaceRoot, options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  console.log(`Wrote headless Playwright auth state to ${outputPath}.`);
  console.log(`Session expires at ${payload.expiresAt}.`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
