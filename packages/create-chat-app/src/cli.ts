import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";

import { DEFAULT_CORE_VERSION, generateApp } from "./generate.ts";

export interface ParsedArgs {
  name?: string;
  dir?: string;
  coreVersion?: string;
  dryRun: boolean;
  force: boolean;
  help: boolean;
}

const flagsWithValue = new Set(["--name", "-n", "--dir", "-d", "--core-version"]);

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

Generates a thin composition root (web/ + worker/) depending on
@emi/core-contract, @emi/core-server, @emi/core-web, and @emi/platform-cloudflare.
No core package source is copied.

Options:
  -n, --name <name>          App name (prompted if omitted and stdin is a TTY)
  -d, --dir <path>           Target directory (default: ./<name>)
      --core-version <ver>   Dependency version string for @emi/core-* packages
                              (default: "${DEFAULT_CORE_VERSION}")
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
  console.log(`  1. Add "${targetDir}" (or its web/ and worker/ folders) to a pnpm workspace`);
  console.log("     that also resolves @emi/core-* packages.");
  console.log("  2. pnpm install");
  console.log("  3. pnpm --filter <web-package-name> typecheck");
  console.log("  4. pnpm --filter <worker-package-name> typecheck");
};
