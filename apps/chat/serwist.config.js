import { serwist } from "@serwist/next/config";

const revision = Date.now().toString();

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/", revision },
    { url: "/offline.html", revision },
  ],
});
