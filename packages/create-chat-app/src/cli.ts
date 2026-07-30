import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";

import {
  DEFAULT_CORE_VERSION,
  DEFAULT_DISTRIBUTION_MODE,
  generateApp,
  type DistributionMode,
} from "./generate.ts";

export interface ParsedArgs {
  name?: string;
  dir?: string;
  coreVersion?: string;
  distributionMode?: DistributionMode;
  dryRun: boolean;
  force: boolean;
  help: boolean;
}

const flagsWithValue = new Set(["--name", "-n", "--dir", "-d", "--core-version", "--mode"]);

export const parseArgs = (argv: string[]): ParsedArgs => {
  const args: ParsedArgs = { dryRun: false, force: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--name" || arg === "-n") {
      args.name = argv[++index];
      continue;
    }
    if (arg === "--dir" || arg === "-d") {
      args.dir = argv[++index];
      continue;
    }
    if (arg === "--core-version") {
      args.coreVersion = argv[++index];
      continue;
    }
    if (arg === "--mode") {
      const mode = argv[++index];
      if (mode === "dependency" || mode === "owned") {
        args.distributionMode = mode;
        continue;
      }
      throw new Error(`Unknown distribution mode: ${mode ?? "missing"}. Use owned or dependency.`);
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (
      args.name === undefined &&
      !arg.startsWith("-") &&
      !flagsWithValue.has(argv[index - 1] ?? "")
    ) {
      args.name = arg;
    }
  }
  return args;
};

export const helpText = `Usage: create-chat-app [name] [options]

Generates an owned full-stack workspace (core/ + web/ + worker/). Use dependency
mode when an existing workspace or published @emi/core package supplies the core.

Options:
  -n, --name <name>          App name (prompted if omitted and stdin is a TTY)
  -d, --dir <path>           Target directory (default: ./<name>)
      --core-version <ver>   Dependency version string for @emi/core
                              (default: "${DEFAULT_CORE_VERSION}")
      --mode <owned|dependency>
                              Distribution mode (default: "${DEFAULT_DISTRIBUTION_MODE}")
      --dry-run              Print the file list without writing anything
      --force                Overwrite a non-empty target directory
  -h, --help                 Show this help text
`;

const promptForName = async (): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("App name: ");
    return answer.trim();
  } finally {
    rl.close();
  }
};

export const run = async (argv: string[]): Promise<void> => {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(helpText);
    return;
  }

  let appName = args.name;
  if ((appName === undefined || appName === "") && process.stdin.isTTY === true) {
    appName = await promptForName();
  }
  if (appName === undefined || appName === "") appName = "my-chat-app";

  const targetDir = resolve(args.dir ?? appName);
  const { files } = await generateApp({
    appName,
    targetDir,
    coreVersion: args.coreVersion ?? DEFAULT_CORE_VERSION,
    distributionMode: args.distributionMode ?? DEFAULT_DISTRIBUTION_MODE,
    dryRun: args.dryRun,
    force: args.force,
  });

  if (args.dryRun) {
    console.log(`Dry run for "${appName}" -> ${targetDir}`);
    for (const file of files) console.log(`  ${file.path}`);
    return;
  }

  console.log(`Generated ${files.length} files for "${appName}" in ${targetDir}`);
  console.log("Next steps:");
  console.log("  1. pnpm install");
  console.log("  2. pnpm typecheck");
  console.log("  3. pnpm --dir worker db:generate");
  console.log("  4. pnpm --dir web build");
};
