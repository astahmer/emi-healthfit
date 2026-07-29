import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const KEY_NAME = "HEVY_CREDENTIAL_ENCRYPTION_KEY";

const run = async () => {
  const environmentPath = resolve(import.meta.dirname, "../../../.env");
  let contents = "";
  try {
    contents = await readFile(environmentPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error(
        `.env missing at ${environmentPath}. Run pnpm setup:google first, or copy .env.example.`,
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const linePattern = new RegExp(`^${KEY_NAME}=`, "m");
  if (linePattern.test(contents)) {
    const value = contents
      .split("\n")
      .find((line) => line.startsWith(`${KEY_NAME}=`))
      ?.slice(KEY_NAME.length + 1)
      ?.trim();
    if (value && !value.startsWith("replace-with")) {
      console.log(`${KEY_NAME} already set in .env`);
      return;
    }
  }

  const key = randomBytes(32).toString("hex");
  const block = `\n# AES-GCM key for per-user Hevy API credentials (32 bytes as hex)\n${KEY_NAME}=${key}\n`;
  const next = linePattern.test(contents)
    ? contents.replace(new RegExp(`^${KEY_NAME}=.*$`, "m"), `${KEY_NAME}=${key}`)
    : `${contents.trimEnd()}\n${block}`;

  await writeFile(environmentPath, next.endsWith("\n") ? next : `${next}\n`, { mode: 0o600 });
  console.log(`Wrote ${KEY_NAME} to ${environmentPath}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
