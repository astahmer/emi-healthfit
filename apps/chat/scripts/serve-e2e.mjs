import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const staticRoot = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const port = Number.parseInt(process.env.E2E_PORT ?? "3100", 10);
const mediaTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".woff2", "font/woff2"],
]);

const findFile = async ({ pathname }) => {
  const decodedPath = decodeURIComponent(pathname);
  const routePath = decodedPath;
  const candidates = routePath.endsWith("/")
    ? [`${routePath}index.html`]
    : extname(routePath) === ""
      ? [routePath, `${routePath}/index.html`, "/index.html"]
      : [routePath];
  const files = await Promise.all(
    candidates.map(async (candidate) => {
      const filePath = resolve(staticRoot, `.${candidate}`);
      if (!filePath.startsWith(`${staticRoot}${sep}`)) return undefined;
      const fileStat = await stat(filePath).catch(() => undefined);
      return fileStat?.isFile() === true ? filePath : undefined;
    }),
  );
  return files.find((filePath) => filePath !== undefined);
};

const sendFile = ({ filePath, request, response, status = 200 }) => {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": mediaTypes.get(extname(filePath)) ?? "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
};

const handleRequest = async ({ request, response }) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1:3100");
  const filePath = await findFile({ pathname: url.pathname });
  if (filePath !== undefined) {
    sendFile({ filePath, request, response });
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not Found");
};

const server = createServer((request, response) => {
  void handleRequest({ request, response }).catch(() => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(500);
    response.end();
  });
});

const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (typeof address === "string" || address === null)
    throw new Error("E2E server has no TCP port");
  const serverUrl = `http://127.0.0.1:${address.port}`;
  process.send?.({ type: "ready", url: serverUrl });
  console.log(`E2E static server listening on ${serverUrl}`);
});
