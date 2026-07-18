import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

const waitForServer = ({ child }) =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      child.off("error", onError);
      child.off("exit", onExit);
      child.off("message", onMessage);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`E2E server exited before ready (code ${code}, signal ${signal})`));
    };
    const onMessage = (message) => {
      if (typeof message !== "object" || message === null) return;
      if (message.type !== "ready" || typeof message.url !== "string") return;
      cleanup();
      resolve(message.url);
    };
    child.once("error", onError);
    child.once("exit", onExit);
    child.on("message", onMessage);
  });

const stopChild = async ({ child }) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = waitForChild({ child });
  child.kill("SIGTERM");
  const stopped = await Promise.race([exit.then(() => true), delay(2_000).then(() => false)]);
  if (stopped) return;
  child.kill("SIGKILL");
  await exit;
};

const server = spawn(process.execPath, [serverPath], {
  env: { ...process.env, E2E_PORT: "0" },
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});
let playwright;

const interrupt = (signal) => {
  playwright?.kill(signal);
  void stopChild({ child: server });
};

process.once("SIGINT", () => interrupt("SIGINT"));
process.once("SIGTERM", () => interrupt("SIGTERM"));

try {
  const serverUrl = await waitForServer({ child: server });
  playwright = spawn(process.execPath, [playwrightPath, "test"], {
    env: { ...process.env, E2E_BASE_URL: serverUrl },
    stdio: "inherit",
  });
  const result = await waitForChild({ child: playwright });
  process.exitCode = result.code ?? 1;
} finally {
  await stopChild({ child: server });
}
