import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as Effect from "effect/Effect";
import * as Runtime from "effect/Runtime";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import type { QueryDatabaseClient } from "../db/operations.ts";
import { buildMcpServer } from "./server.ts";

const corsHeaders = (request: HttpServerRequest) => {
  const origin = request.headers["origin"] ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers":
      "authorization, content-type, mcp-session-id, last-event-id, mcp-protocol-version",
    "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
  };
};

export const handleMcp = (
  db: QueryDatabaseClient,
  runtime: Runtime.Runtime<never>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    if (request.method === "OPTIONS") {
      return HttpServerResponse.text("", { headers: corsHeaders(request) });
    }

    const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
      Effect.runPromise(effect, { runtime });

    const nativeRequest = request.source as Request;
    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = buildMcpServer(db, run);
    yield* Effect.promise(() => server.connect(transport));
    const response = yield* Effect.promise(() =>
      transport.handleRequest(nativeRequest),
    );

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      headers.set(key, value);
    }

    return HttpServerResponse.fromWeb(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
    );
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );
