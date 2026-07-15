import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const CredentialsPathSchema = z.string().min(1);
const EmailSchema = z.string().email();
const BaseUrlSchema = z.string().url();
const ArgumentsSchema = z.union([
  z.tuple([CredentialsPathSchema, EmailSchema]),
  z.tuple([CredentialsPathSchema, EmailSchema, BaseUrlSchema]),
]);

const GoogleCredentialsSchema = z.object({
  web: z.object({
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    redirect_uris: z.array(z.string().url()),
  }),
});

const run = async () => {
  const commandArguments = process.argv.slice(2);
  const [credentialsPath, allowedEmail, configuredBaseUrl] = ArgumentsSchema.parse(
    commandArguments[0] === "--" ? commandArguments.slice(1) : commandArguments,
  );
  const baseUrl = (configuredBaseUrl ?? "http://localhost:1337").replace(/\/$/, "");
  const callbackUrl = `${baseUrl}/api/auth/callback/google`;
  const credentials = GoogleCredentialsSchema.parse(
    JSON.parse(await readFile(resolve(credentialsPath), "utf8")),
  );

  if (!credentials.web.redirect_uris.includes(callbackUrl)) {
    throw new Error(
      `Google client is missing authorized redirect URI ${callbackUrl}. Add it in Google Auth Platform, download the JSON again, then rerun this command.`,
    );
  }

  const environmentPath = resolve(import.meta.dirname, "../../../.env");
  const environment = [
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64url")}`,
    `BETTER_AUTH_URL=${baseUrl}`,
    `GOOGLE_CLIENT_ID=${credentials.web.client_id}`,
    `GOOGLE_CLIENT_SECRET=${credentials.web.client_secret}`,
    `ALLOWED_EMAILS=${allowedEmail.toLowerCase()}`,
    "",
  ].join("\n");

  await writeFile(environmentPath, environment, { flag: "wx", mode: 0o600 });
  console.log(`Created ${environmentPath}`);
  console.log(`Google callback: ${callbackUrl}`);
};

run().catch((error) => {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.error(".env already exists; move or remove it before rerunning setup.");
    process.exitCode = 1;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
