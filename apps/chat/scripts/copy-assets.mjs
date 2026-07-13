import { cp, rm, readdir } from "node:fs/promises";

const distDir = new URL("../dist/", import.meta.url);
const assetsDir = new URL("../../api/assets/", import.meta.url);

const entries = await readdir(assetsDir).catch(() => []);
for (const entry of entries) {
  await rm(new URL(entry, assetsDir), { recursive: true, force: true });
}

await cp(distDir, assetsDir, { recursive: true, force: true });
console.log(`Copied ${distDir.pathname} to ${assetsDir.pathname}`);
