declare module "next/dist/compiled/compression" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  type Next = (error?: unknown) => void;
  type Middleware = (request: IncomingMessage, response: ServerResponse, next: Next) => void;

  const compression: () => Middleware;
  export default compression;
}
