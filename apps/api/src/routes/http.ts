import * as Effect from "effect/Effect";
import { HttpServerRequest, toWeb as requestToWeb } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

export const handleAssetRequest = ({
  assetsFetcher,
  request,
}: {
  assetsFetcher: ((request: Request) => Promise<Response>) | undefined;
  request: HttpServerRequest;
}) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname;
    if (assetsFetcher === undefined) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const nativeRequest = yield* requestToWeb(request);
    const assetRequest = pathname.match(/^\/chat\/[^/]+\/?$/)
      ? new Request(new URL("/chat/", url), nativeRequest)
      : nativeRequest;
    const response = yield* Effect.promise(() => assetsFetcher(assetRequest));
    return HttpServerResponse.fromWeb(response);
  });

export const corsHeaders = (request: HttpServerRequest): Record<string, string> => {
  const origin = request.headers["origin"] ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers":
      "authorization, content-type, mcp-session-id, last-event-id, mcp-protocol-version, x-request-id, x-trace-id",
    "access-control-expose-headers":
      "mcp-session-id, mcp-protocol-version, x-thread-id, x-generation-id, x-request-id, x-trace-id",
  };
};

export const handleCorsPreflight = (request: HttpServerRequest) =>
  Effect.succeed(HttpServerResponse.text("", { headers: corsHeaders(request) }));

export const withCors = <E, R>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  request: HttpServerRequest,
) =>
  effect.pipe(
    Effect.map((response) => HttpServerResponse.setHeaders(response, corsHeaders(request))),
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );
