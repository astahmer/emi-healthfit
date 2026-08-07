import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const packageFilters = ["--filter=./apps/*", "--filter=./packages/*"];
const fullStages = ["static", "tests", "verify", "schema", "generated", "e2e"];
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

const runTurbo = ({ tasks, concurrency = process.env.RELEASE_CONCURRENCY ?? "3" }) =>
  run({
    args: ["exec", "turbo", "run", ...tasks, ...packageFilters, "--concurrency", concurrency],
  });

const stages = {
  static: async () => {
    await run({ args: ["slop:check"] });
    await runTurbo({ tasks: ["lint", "typecheck", "build"] });
  },
  unit: () => runTurbo({ tasks: ["test"] }),
  tests: () => runTurbo({ tasks: ["test:release"] }),
  verify: () => run({ args: ["verify"] }),
  schema: () => run({ args: ["--filter", "@emi/api", "db:check"] }),
  generated: () => run({ args: ["verify:chat-app"] }),
  e2e: async () => {
    await run({ args: ["--dir", "apps/chat", "test:e2e:run"] });
    await run({ args: ["--dir", "apps/generic-web", "test:e2e"] });
    await run({ args: ["--dir", "apps/chat", "test:e2e:worker"] });
  },
};

const optionValue = ({ args, index, option }) => {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a stage name.`);
  }
  return value;
};

const parseOptions = () => {
  const args = process.argv.slice(2);
  const options = { fast: false, from: undefined, list: false, stage: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--fast") {
      options.fast = true;
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
    if (argument === "--full") continue;
    throw new Error(`Unknown option: ${argument}`);
  }
  if (options.fast && (options.stage !== undefined || options.from !== undefined)) {
    throw new Error("--fast cannot be combined with --stage or --from.");
  }
  return options;
};

const selectedStages = (options) => {
  if (options.list) return [];
  if (options.fast) return ["static", "unit"];
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

const runStage = async (name) => {
  const startedAt = performance.now();
  console.log(`\n==> release check: ${name}`);
  await stages[name]();
  console.log(`<== release check: ${name} ${(performance.now() - startedAt) / 1000}s`);
};

try {
  const options = parseOptions();
  if (options.list) {
    console.log([...fullStages, "unit"].join("\n"));
  } else {
    const selected = selectedStages(options);
    console.log(`Release check stages: ${selected.join(", ")}`);
    for (const stage of selected) await runStage(stage);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
