import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const packageFilters = ["--filter=./apps/*", "--filter=./packages/*"];
const fullStages = ["static", "tests", "verify", "schema", "generated", "e2e"];
const listedStages = ["static", "unit", "smoke", ...fullStages.slice(1)];
const releaseEnvironment = {
  ...process.env,
  PLAYWRIGHT_WORKERS: process.env.PLAYWRIGHT_WORKERS ?? "4",
  VITEST_MAX_WORKERS: process.env.VITEST_MAX_WORKERS ?? "3",
};

const run = ({ args, cwd = rootDirectory }) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(pnpm, args, {
      cwd,
      env: releaseEnvironment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(
          `${pnpm} ${args.join(" ")} exited with ${signal ?? `code ${code ?? "unknown"}`}.`,
        ),
      );
    });
  });

const runTurbo = async ({
  tasks,
  options,
  profileName,
  concurrency = process.env.RELEASE_CONCURRENCY ??
    (options.affected ? (process.env.RELEASE_AFFECTED_CONCURRENCY ?? "2") : "3"),
}) => {
  const args = ["exec", "turbo", "run", ...tasks, ...packageFilters, "--concurrency", concurrency];
  if (options.affected) args.push("--affected");
  if (options.profile !== undefined) {
    const profilePath = resolve(rootDirectory, `${options.profile}.${profileName}.json`);
    await mkdir(dirname(profilePath), { recursive: true });
    args.push("--profile", profilePath);
  }
  return run({ args });
};

const stages = {
  static: async (options) => {
    await run({ args: ["slop:check"] });
    await runTurbo({ tasks: ["lint", "typecheck", "build"], options, profileName: "static" });
  },
  unit: (options) => runTurbo({ tasks: ["test"], options, profileName: "unit" }),
  tests: (options) => runTurbo({ tasks: ["test:release"], options, profileName: "tests" }),
  verify: () => run({ args: ["verify"] }),
  schema: () => run({ args: ["--filter", "@emi/api", "db:check"] }),
  generated: () => run({ args: ["verify:chat-app"] }),
  smoke: async () => {
    await run({ args: ["--dir", "apps/chat", "build"] });
    await run({
      args: [
        "--dir",
        "apps/chat",
        "test:e2e:run",
        "--",
        "e2e/chat.spec.ts:31",
        "e2e/settings-version.spec.ts",
      ],
    });
    await run({
      args: [
        "--dir",
        "apps/generic-web",
        "test:e2e",
        "test/e2e/generic-chat.spec.ts:7",
        "test/e2e/layout.spec.ts",
      ],
    });
  },
  e2e: async () => {
    await run({ args: ["--dir", "apps/chat", "test:e2e:run"] });
    await run({ args: ["--dir", "apps/generic-web", "test:e2e"] });
    await run({ args: ["--dir", "apps/chat", "test:e2e:worker"] });
  },
};

const optionValue = ({ args, index, option }) => {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
};

const parseOptions = () => {
  const args = process.argv.slice(2);
  const options = {
    affected: false,
    fast: false,
    from: undefined,
    list: false,
    profile: undefined,
    stage: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--fast") {
      options.fast = true;
      continue;
    }
    if (argument === "--affected") {
      options.affected = true;
      continue;
    }
    if (argument === "--list") {
      options.list = true;
      continue;
    }
    if (argument === "--stage") {
      options.stage = optionValue({ args, index, option: argument });
      index += 1;
      continue;
    }
    if (argument === "--from") {
      options.from = optionValue({ args, index, option: argument });
      index += 1;
      continue;
    }
    if (argument === "--profile") {
      options.profile = optionValue({ args, index, option: argument });
      index += 1;
      continue;
    }
    if (argument === "--full") continue;
    throw new Error(`Unknown option: ${argument}`);
  }
  if (options.fast && (options.stage !== undefined || options.from !== undefined)) {
    throw new Error("--fast cannot be combined with --stage or --from.");
  }
  if (
    options.affected &&
    (options.fast || options.stage !== undefined || options.from !== undefined)
  ) {
    throw new Error("--affected cannot be combined with --fast, --stage, or --from.");
  }
  return options;
};

const selectedStages = (options) => {
  if (options.list) return [];
  if (options.fast) return ["static", "unit"];
  if (options.affected) return ["static", "unit"];
  if (options.stage !== undefined) {
    if (!(options.stage in stages)) throw new Error(`Unknown stage: ${options.stage}`);
    return [options.stage];
  }
  if (options.from !== undefined) {
    const start = fullStages.indexOf(options.from);
    if (start === -1) throw new Error(`Cannot start full check from ${options.from}.`);
    return fullStages.slice(start);
  }
  return fullStages;
};

const runStage = async (name, options) => {
  const startedAt = performance.now();
  console.log(`\n==> release check: ${name}`);
  await stages[name](options);
  console.log(`<== release check: ${name} ${(performance.now() - startedAt) / 1000}s`);
};

try {
  const options = parseOptions();
  if (options.list) {
    console.log(listedStages.join("\n"));
  } else {
    const selected = selectedStages(options);
    console.log(`Release check stages: ${selected.join(", ")}`);
    for (const stage of selected) await runStage(stage, options);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
