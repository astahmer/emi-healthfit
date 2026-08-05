import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const apiOrigin = "http://127.0.0.1:1337";
const webOrigin = "http://127.0.0.1:3232";
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

class HerdrError extends Error {
  constructor(message) {
    super(message);
    this.name = "HerdrError";
  }
}

const socketPath = () => {
  if (process.env.HERDR_SOCKET_PATH) return process.env.HERDR_SOCKET_PATH;
  const session = process.env.HERDR_SESSION?.trim();
  return session
    ? join(homedir(), ".config", "herdr", "sessions", session, "herdr.sock")
    : join(homedir(), ".config", "herdr", "herdr.sock");
};

const herdrRequest = (method, params = {}) =>
  new Promise((resolveRequest, reject) => {
    const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const socket = createConnection({ path: socketPath() });
    const lines = createInterface({ input: socket });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      lines.close();
      socket.destroy();
      if (result.error) reject(result.error);
      else resolveRequest(result.value);
    };
    socket.once("connect", () => socket.write(`${JSON.stringify({ id, method, params })}\n`));
    lines.once("line", (line) => {
      const message = JSON.parse(line);
      if (message.id !== id) finish({ error: new HerdrError("unexpected response id") });
      else if (message.error) finish({ error: new HerdrError(message.error.message) });
      else if (message.result) finish({ value: message.result });
      else finish({ error: new HerdrError(`no result for ${method}`) });
    });
    socket.once("error", (error) => finish({ error }));
    socket.once("close", () => {
      if (!settled) finish({ error: new HerdrError("herdr socket closed before response") });
    });
  });

const ping = async () => {
  await herdrRequest("ping");
  return true;
};

const ensureHerdrServer = async () => {
  try {
    await ping();
    return false;
  } catch {}
  const child = spawn("herdr", ["server"], { detached: true, stdio: "ignore" });
  child.unref();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await ping();
      return true;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    }
  }
  throw new HerdrError("herdr server did not become ready");
};

const workspaceList = async () => (await herdrRequest("workspace.list", {})).workspaces ?? [];

const confirmOverride = async (label) => {
  if (process.argv.includes("--yes")) return;
  if (!process.stdin.isTTY) {
    throw new Error(
      `Herdr workspace "${label}" already exists. Close it or re-run with --yes to replace it.`,
    );
  }
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise((resolveAnswer) => {
    prompt.question(`Herdr workspace "${label}" already exists. Override it? [y/N] `, (value) => {
      prompt.close();
      resolveAnswer(value.trim().toLowerCase());
    });
  });
  if (answer !== "y" && answer !== "yes") throw new Error("Aborted.");
};

const createEnvironmentFile = async () => {
  const environmentPath = join(rootDirectory, ".env");
  let source;
  try {
    source = await readFile(environmentPath, "utf8");
  } catch {
    throw new Error(
      `Missing ${environmentPath} in this checkout. Copy it from your main checkout (it is gitignored, so jj workspaces start without it).`,
    );
  }
  const lines = source.split("\n").filter((line) => {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) return false;
    const key = line.slice(0, separatorIndex).trim();
    return apiEnvironmentKeys.has(key) && key !== "BETTER_AUTH_URL";
  });
  lines.push(`BETTER_AUTH_URL=${webOrigin}`);
  const environmentFile = join(tmpdir(), "emi-healthfit-dev-apps.env");
  await writeFile(environmentFile, `${lines.join("\n")}\n`);
  return environmentFile;
};

const shellQuote = (value) => {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
};

const formatCommandLine = (command, args, environment = {}) =>
  [
    "env",
    "-u",
    "NO_COLOR",
    "FORCE_COLOR=1",
    ...Object.entries(environment).map(([key, value]) => `${key}=${value}`),
    command,
    ...args,
  ]
    .map(shellQuote)
    .join(" ");

const workspacePrefix = () => {
  const explicit = process.env.DEV_NAME?.trim();
  if (explicit)
    return explicit
      .replaceAll(/[^a-z0-9-]+/gi, "-")
      .replaceAll(/-+/g, "-")
      .replaceAll(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 63);
  const normalized = resolve(rootDirectory).replaceAll("\\", "/");
  const match = normalized.match(/\/(?:\.workspaces|\.codex\/worktrees|worktrees)\/([^/]+)/);
  return match?.[1]
    ? match[1]
        .replaceAll(/[^a-z0-9-]+/gi, "-")
        .toLowerCase()
        .slice(0, 63)
    : "";
};

const buildCore = () =>
  new Promise((resolveBuild, reject) => {
    const child = spawn("pnpm", ["--dir", "packages/core", "build"], {
      cwd: rootDirectory,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolveBuild();
      else reject(new Error(`@emi/core build failed (${code}).`));
    });
  });

const run = async () => {
  const prefix = workspacePrefix();
  const label = prefix ? `emi-healthfit-${prefix}` : "emi-healthfit";
  const environmentFile = await createEnvironmentFile();
  console.log(`dev: building @emi/core once (herdr tabs reuse it)`);
  await buildCore();
  const started = await ensureHerdrServer();
  const existing = (await workspaceList()).filter((workspace) => workspace.label === label);
  if (existing.length > 0) await confirmOverride(label);
  for (const workspace of existing) {
    await herdrRequest("workspace.close", { workspace_id: workspace.workspace_id });
  }
  const { workspace, tab } = await herdrRequest("workspace.create", {
    cwd: rootDirectory,
    label,
    focus: true,
  });
  const paneEnvironment = { ...process.env };
  delete paneEnvironment.NO_COLOR;
  const overview = (
    await herdrRequest("layout.apply", {
      tab_id: tab.tab_id,
      tab_label: "overview",
      focus: true,
      root: { type: "pane", label: "overview", cwd: rootDirectory, env: paneEnvironment },
    })
  ).layout;
  const overviewLines = [
    `emi-healthfit dev — ${label}`,
    "",
    `api      ${apiOrigin}`,
    `chat     ${webOrigin}/chat`,
    "",
    "Services run in other tabs. Attach with: herdr",
  ];
  await herdrRequest("pane.send_input", {
    pane_id: overview.focused_pane_id,
    text: `printf '%s\\n' ${overviewLines.map(shellQuote).join(" ")}`,
    keys: ["enter"],
  });
  const jobs = [
    {
      label: "api",
      command: "pnpm",
      args: ["--dir", "apps/api", "run", "alchemy", "dev", "--env-file", environmentFile],
      environment: { EMI_SKIP_CORE_BUILD: "1" },
    },
    {
      label: "chat",
      command: "pnpm",
      args: ["--dir", "apps/chat", "exec", "vite", "--host", "127.0.0.1", "--port", "3232"],
      environment: { API_BASE_URL: apiOrigin },
    },
  ];
  for (const job of jobs) {
    const service = (
      await herdrRequest("layout.apply", {
        workspace_id: workspace.workspace_id,
        tab_label: job.label,
        focus: false,
        root: { type: "pane", label: job.label, cwd: rootDirectory, env: paneEnvironment },
      })
    ).layout;
    await herdrRequest("pane.send_input", {
      pane_id: service.focused_pane_id,
      text: formatCommandLine(job.command, job.args, job.environment),
      keys: ["enter"],
    });
  }
  await herdrRequest("workspace.focus", { workspace_id: workspace.workspace_id });
  await herdrRequest("tab.focus", { tab_id: overview.tab_id });
  console.log("");
  console.log(`emi-healthfit dev — ${label}`);
  console.log(`api      ${apiOrigin}`);
  console.log(`chat     ${webOrigin}/chat`);
  console.log("");
  console.log(`Created Herdr workspace with id: ${workspace.workspace_id}`);
  if (started) console.log("dev: started herdr server in the background");
  if (process.env.HERDR_ENV !== "1") console.log("Attach with: herdr");
};

const checkHerdr = () => {
  const result = spawnSync("herdr", ["--version"], { encoding: "utf8", stdio: "ignore" });
  if (result.error) {
    console.error(
      "dev: herdr is not on PATH (https://herdr.dev/docs/install/). Install it, or use `pnpm chat:dev` for the single-terminal fallback.",
    );
    process.exitCode = 1;
    return false;
  }
  return true;
};

if (checkHerdr()) {
  await run();
}
