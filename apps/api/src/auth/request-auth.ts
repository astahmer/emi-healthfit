import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { toWeb as requestToWeb } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { QueryDatabaseClient } from "../db/operations.ts";
import { makeAuth, parseAllowedEmails, type AuthConfiguration } from "./auth.ts";

const AuthEnvironment = Schema.Struct({
  BETTER_AUTH_SECRET: Schema.String.check(Schema.isMinLength(32)),
  BETTER_AUTH_URL: Schema.String.check(Schema.isPattern(/^https?:\/\//)),
  GOOGLE_CLIENT_ID: Schema.String.check(Schema.isMinLength(1)),
  GOOGLE_CLIENT_SECRET: Schema.String.check(Schema.isMinLength(1)),
  ALLOWED_EMAILS: Schema.String.check(Schema.isPattern(/\S+@\S+/)),
});

interface AuthPrincipal {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export const isProtectedPath = (pathname: string): boolean =>
  pathname === "/ingest" || pathname === "/chat" || pathname.startsWith("/api/");

const getConfiguration = Effect.fn("auth.configuration")(function* ({
  environment,
}: {
  environment: Record<string, unknown>;
}) {
  const decoded = yield* Schema.decodeUnknownEffect(AuthEnvironment)(environment);
  const allowedEmails = parseAllowedEmails(decoded.ALLOWED_EMAILS);
  if (allowedEmails.size !== 1) {
    return yield* Effect.fail(
      new Error(
        "Configure exactly one allowed email until per-row ownership migration is complete",
      ),
    );
  }
  const configuration: AuthConfiguration = {
    baseUrl: decoded.BETTER_AUTH_URL,
    clientId: decoded.GOOGLE_CLIENT_ID,
    clientSecret: decoded.GOOGLE_CLIENT_SECRET,
    secret: decoded.BETTER_AUTH_SECRET,
    allowedEmails,
  };
  return configuration;
});

const getRequestAuth = Effect.fn("auth.request")(function* ({
  db,
  environment,
  request,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  request: HttpServerRequest;
}) {
  const database = yield* db.raw;
  const configuration = yield* getConfiguration({ environment });
  const webRequest = yield* requestToWeb(request);
  return {
    auth: makeAuth({ database, configuration }),
    configuration,
    webRequest,
  };
});

export const handleAuthRequest = Effect.fn("auth.handler")(function* ({
  db,
  environment,
  request,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  request: HttpServerRequest;
}) {
  const requestAuth = yield* getRequestAuth({ db, environment, request });
  const response = yield* Effect.tryPromise({
    try: () => requestAuth.auth.handler(requestAuth.webRequest),
    catch: (error) => new Error(`Authentication request failed: ${String(error)}`),
  });
  return HttpServerResponse.fromWeb(response);
});

export const authenticateRequest = Effect.fn("auth.session")(function* ({
  db,
  environment,
  request,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  request: HttpServerRequest;
}) {
  const requestAuth = yield* getRequestAuth({ db, environment, request });
  const session = yield* Effect.tryPromise({
    try: () => requestAuth.auth.api.getSession({ headers: requestAuth.webRequest.headers }),
    catch: (error) => new Error(`Session lookup failed: ${String(error)}`),
  });
  if (session === null) return null;
  const email = session.user.email.trim().toLowerCase();
  if (!session.user.emailVerified || !requestAuth.configuration.allowedEmails.has(email)) {
    yield* Effect.logWarning("auth.session.denied").pipe(
      Effect.annotateLogs({ userId: session.user.id }),
    );
    return null;
  }
  const principal: AuthPrincipal = {
    id: session.user.id,
    email,
    name: session.user.name,
    image: session.user.image ?? null,
  };
  return principal;
});
