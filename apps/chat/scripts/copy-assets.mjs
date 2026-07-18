import { cp, readdir, rm } from "node:fs/promises";

const distDir = new URL("../dist/", import.meta.url);
const assetsDir = new URL("../../api/assets/", import.meta.url);

const entries = await readdir(assetsDir).catch(() => []);
await Promise.all(
  entries.map((entry) => rm(new URL(entry, assetsDir), { recursive: true, force: true })),
);

await cp(distDir, assetsDir, { recursive: true, force: true });
console.log(`Copied ${distDir.pathname} to ${assetsDir.pathname}`);
