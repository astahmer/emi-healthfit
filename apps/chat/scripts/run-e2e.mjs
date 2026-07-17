import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverUrl = "http://127.0.0.1:3100/chat";
const serverPath = fileURLToPath(new URL("./serve-e2e.mjs", import.meta.url));
const playwrightPath = fileURLToPath(import.meta.resolve("@playwright/test/cli"));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitForChild = ({ child }) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
};

const waitForServer = async ({ deadline }) => {
  try {
    const response = await fetch(serverUrl);
    if (response.ok) return;
  } catch {}
  if (Date.now() >= deadline) throw new Error(`E2E server did not start at ${serverUrl}`);
  await delay(50);
  return waitForServer({ deadline });
};

const stopChild = async ({ child }) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = waitForChild({ child });
  child.kill("SIGTERM");
  const stopped = await Promise.race([exit.then(() => true), delay(2_000).then(() => false)]);
  if (stopped) return;
  child.kill("SIGKILL");
  await exit;
};

const server = spawn(process.execPath, [serverPath], { stdio: "inherit" });
let playwright;

const interrupt = (signal) => {
  playwright?.kill(signal);
  void stopChild({ child: server });
};

process.once("SIGINT", () => interrupt("SIGINT"));
process.once("SIGTERM", () => interrupt("SIGTERM"));

try {
  await waitForServer({ deadline: Date.now() + 10_000 });
  playwright = spawn(process.execPath, [playwrightPath, "test"], { stdio: "inherit" });
  const result = await waitForChild({ child: playwright });
  process.exitCode = result.code ?? 1;
} finally {
  await stopChild({ child: server });
}
