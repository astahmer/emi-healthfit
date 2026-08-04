import { appendFile, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

const parseArguments = (arguments_) => {
  const options = { email: undefined, envFile: ".env" };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--environment-file") {
      options.envFile = arguments_[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--email") {
      options.email = arguments_[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
};

const valueFrom = (contents, key) => {
  const line = contents.split("\n").find((candidate) => candidate.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() || undefined;
};

const run = async () => {
  const options = parseArguments(process.argv.slice(2));
  const environmentPath = resolve(workspaceRoot, options.envFile ?? ".env");
  if (!existsSync(environmentPath)) {
    throw new Error(`Environment file not found: ${environmentPath}`);
  }

  const contents = await readFile(environmentPath, "utf8");
  const allowedEmails = (valueFrom(contents, "ALLOWED_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== "");
  const configuredEmail = valueFrom(contents, "AGENT_AUTH_EMAIL");
  const email = (options.email ?? configuredEmail ?? allowedEmails[0])?.trim().toLowerCase();
  if (email === undefined || !/^\S+@\S+$/.test(email)) {
    throw new Error("Set AGENT_AUTH_EMAIL or provide --email with an allowlisted email.");
  }
  if (!allowedEmails.includes(email)) {
    throw new Error("The agent email must be present in ALLOWED_EMAILS.");
  }

  const additions = [];
  if (valueFrom(contents, "AGENT_AUTH_SECRET") === undefined) {
    additions.push(`AGENT_AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
  }
  if (configuredEmail === undefined) {
    additions.push(`AGENT_AUTH_EMAIL=${email}`);
  }
  if (additions.length === 0) {
    console.log(`Local headless agent auth is already configured for ${email}.`);
    return;
  }

  const separator = contents.endsWith("\n") ? "" : "\n";
  await appendFile(
    environmentPath,
    `${separator}\n# Local-only headless agent session; never deploy these values.\n${additions.join("\n")}\n`,
  );
  console.log(`Configured local headless agent auth for ${email}. Restart the API Worker.`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
