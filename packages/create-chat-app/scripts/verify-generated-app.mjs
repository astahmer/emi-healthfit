import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const run = ({ command, args, cwd }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? `code ${code ?? "unknown"}`}.`));
    });
  });

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
} finally {
  await rm(targetDirectory, { recursive: true, force: true });
}
