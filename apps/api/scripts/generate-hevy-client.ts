import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["--filter", "@emi/flavor-healthfit", "hevy:client"], {
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
