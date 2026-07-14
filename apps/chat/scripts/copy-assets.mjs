import { cp, rm, readdir } from "node:fs/promises";

const distDir = new URL("../dist/", import.meta.url);
const publicDir = new URL("../public/", import.meta.url);
const assetsDir = new URL("../../api/assets/", import.meta.url);

const entries = await readdir(assetsDir).catch(() => []);
for (const entry of entries) {
  await rm(new URL(entry, assetsDir), { recursive: true, force: true });
}

// Serwist writes the service worker to public/ after Next.js has exported to
// dist/, so copy it into dist/ before syncing with the API assets folder.
for (const file of ["sw.js"]) {
  await cp(new URL(file, publicDir), new URL(file, distDir), { force: true }).catch(() => {});
}

await cp(distDir, assetsDir, { recursive: true, force: true });
console.log(`Copied ${distDir.pathname} to ${assetsDir.pathname}`);
