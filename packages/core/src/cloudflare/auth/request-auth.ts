import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { toWeb as requestToWeb } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  isAuthorizedAuthEmail,
  parseAllowedEmails,
} from "../../server/auth/emails.ts";
import {
  CurrentUser,
  makeAuthRequestContext,
  withCurrentUser,
  type AuthPrincipal,
} from "../../server/auth/principal.ts";
import {
  CurrentRequestContext,
  withRequestContext,
  type RequestContext,
} from "../../server/request-context.ts";
import type { CloudflareQueryDatabaseClient } from "../db/client.ts";
import { anonymousSignInPath, createAnonymousSessionResponse } from "./anonymous-session.ts";
import { makeAuth, type AuthConfiguration } from "./make-auth.ts";

export type AuthPolicy = "google-allowlist" | "anonymous";

export type AuthDatabaseClient = Pick<CloudflareQueryDatabaseClient<unknown>, "raw">;

const GoogleAllowlistEnvironment = Schema.Struct({
  BETTER_AUTH_SECRET: Schema.String.check(Schema.isMinLength(32)),
  BETTER_AUTH_URL: Schema.String.check(Schema.isPattern(/^https?:\/\//)),
  GOOGLE_CLIENT_ID: Schema.String.check(Schema.isMinLength(1)),
  GOOGLE_CLIENT_SECRET: Schema.String.check(Schema.isMinLength(1)),
  ALLOWED_EMAILS: Schema.String.check(Schema.isPattern(/\S+@\S+/)),
  AUTH_APP_NAME: Schema.optional(Schema.String),
});

const AnonymousAuthEnvironment = Schema.Struct({
  BETTER_AUTH_SECRET: Schema.String.check(Schema.isMinLength(32)),
  BETTER_AUTH_URL: Schema.String.check(Schema.isPattern(/^https?:\/\//)),
  AUTH_APP_NAME: Schema.optional(Schema.String),
  ALLOWED_EMAILS: Schema.optional(Schema.String),
  GOOGLE_CLIENT_ID: Schema.optional(Schema.String),
  GOOGLE_CLIENT_SECRET: Schema.optional(Schema.String),
});

export const getAuthConfiguration = Effect.fn("auth.configuration")(function* ({
  environment,
  policy,
}: {
  environment: Record<string, unknown>;
  policy: AuthPolicy;
}) {
  if (policy === "google-allowlist") {
    const decoded = yield* Schema.decodeUnknownEffect(GoogleAllowlistEnvironment)(environment);
    const allowedEmails = parseAllowedEmails(decoded.ALLOWED_EMAILS);
    if (allowedEmails.size === 0) {
      return yield* Effect.fail(new Error("Configure at least one allowed email"));
    }
    const configuration: AuthConfiguration = {
      appName: decoded.AUTH_APP_NAME ?? "Emi HealthFit",
      baseUrl: decoded.BETTER_AUTH_URL,
      secret: decoded.BETTER_AUTH_SECRET,
      allowedEmails,
      google: {
        clientId: decoded.GOOGLE_CLIENT_ID,
        clientSecret: decoded.GOOGLE_CLIENT_SECRET,
      },
    };
    return configuration;
  }

  const decoded = yield* Schema.decodeUnknownEffect(AnonymousAuthEnvironment)(environment);
  const allowedEmails = parseAllowedEmails(decoded.ALLOWED_EMAILS ?? "");
  const hasGoogle =
    decoded.GOOGLE_CLIENT_ID !== undefined &&
    decoded.GOOGLE_CLIENT_ID !== "" &&
    decoded.GOOGLE_CLIENT_SECRET !== undefined &&
    decoded.GOOGLE_CLIENT_SECRET !== "";
  if (hasGoogle && allowedEmails.size === 0) {
    return yield* Effect.fail(new Error("Configure ALLOWED_EMAILS when Google auth is enabled"));
  }
  const configuration: AuthConfiguration = {
    appName: decoded.AUTH_APP_NAME ?? "Core Chat",
    baseUrl: decoded.BETTER_AUTH_URL,
    secret: decoded.BETTER_AUTH_SECRET,
    allowedEmails,
    google: hasGoogle
      ? {
          clientId: decoded.GOOGLE_CLIENT_ID ?? "",
          clientSecret: decoded.GOOGLE_CLIENT_SECRET ?? "",
        }
      : undefined,
  };
  return configuration;
});

const getRequestAuth = Effect.fn("auth.request")(function* ({
  db,
  environment,
  policy,
  request,
}: {
  db: AuthDatabaseClient;
  environment: Record<string, unknown>;
  policy: AuthPolicy;
  request: HttpServerRequest;
}) {
  const database = yield* db.raw;
  const configuration = yield* getAuthConfiguration({ environment, policy });
  const webRequest = yield* requestToWeb(request);
  return {
    auth: makeAuth({ database, configuration }),
    configuration,
    database,
    webRequest,
  };
});

export const handleAuthRequest = Effect.fn("auth.handler")(function* ({
  db,
  environment,
  policy = "google-allowlist",
  request,
}: {
  db: AuthDatabaseClient;
  environment: Record<string, unknown>;
  policy?: AuthPolicy;
  request: HttpServerRequest;
}) {
  const requestAuth = yield* getRequestAuth({ db, environment, policy, request });
  const response = yield* Effect.tryPromise({
    try: () =>
      new URL(requestAuth.webRequest.url).pathname === anonymousSignInPath
        ? createAnonymousSessionResponse({
            baseUrl: requestAuth.configuration.baseUrl,
            database: requestAuth.database,
            request: requestAuth.webRequest,
            secret: requestAuth.configuration.secret,
          })
        : requestAuth.auth.handler(requestAuth.webRequest),
    catch: (error) => new Error(`Authentication request failed: ${String(error)}`),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError("Auth handler error").pipe(
        Effect.annotateLogs({ path: request.url, error: String(error) }),
      ),
    ),
  );
  return HttpServerResponse.fromWeb(response);
});

const demoPrincipalFromHeader = ({
  environment,
  request,
}: {
  environment: Record<string, unknown>;
  request: HttpServerRequest;
}): AuthPrincipal | null => {
  if (environment.ALLOW_DEMO_USER_HEADER !== "1") return null;
  const demoUserId = request.headers["x-demo-user-id"];
  if (typeof demoUserId !== "string" || demoUserId === "") return null;
  return {
    id: demoUserId,
    email: `demo-${demoUserId}@demo.local`,
    name: "Demo",
    image: null,
  };
};

/** Exported for unit tests — production callers use authenticateRequest. */
export const readDemoPrincipalFromHeader = demoPrincipalFromHeader;

export const authenticateRequest = Effect.fn("auth.session")(function* ({
  db,
  environment,
  policy = "google-allowlist",
  request,
}: {
  db: AuthDatabaseClient;
  environment: Record<string, unknown>;
  policy?: AuthPolicy;
  request: HttpServerRequest;
}) {
  const demoPrincipal = demoPrincipalFromHeader({ environment, request });
  if (demoPrincipal !== null) return demoPrincipal;

  const requestAuth = yield* getRequestAuth({ db, environment, policy, request });
  const session = yield* Effect.tryPromise({
    try: () => requestAuth.auth.api.getSession({ headers: requestAuth.webRequest.headers }),
    catch: (error) => new Error(`Session lookup failed: ${String(error)}`),
  });
  if (session === null) return null;
  const email = session.user.email.trim().toLowerCase();
  if (
    !isAuthorizedAuthEmail({
      allowedEmails: requestAuth.configuration.allowedEmails,
      email,
      emailVerified: session.user.emailVerified,
    })
  ) {
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

export const authenticateWorkerFetch = Effect.fn("auth.workerFetch")(function* <E, R>({
  db,
  environment,
  isProtectedPath,
  policy,
  request,
  route,
}: {
  db: AuthDatabaseClient;
  environment: Record<string, unknown>;
  isProtectedPath: (pathname: string) => boolean;
  policy: AuthPolicy;
  request: HttpServerRequest;
  route: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>;
}) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname.startsWith("/api/auth/")) {
    return yield* handleAuthRequest({ db, environment, policy, request });
  }
  const protectedPath = isProtectedPath(pathname);
  const principal = protectedPath
    ? yield* authenticateRequest({ db, environment, policy, request })
    : null;
  if (protectedPath) {
    if (principal === null) {
      return yield* HttpServerResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    yield* Effect.logDebug("auth.request.authorized").pipe(
      Effect.annotateLogs({ userId: principal.id, pathname }),
    );
  }
  if (principal !== null) {
    const requestContext = makeAuthRequestContext({ principal });
    return yield* withRequestContext({
      requestContext,
      effect: withCurrentUser({ effect: route, principal }),
    });
  }
  return yield* route;
});

export {
  CurrentRequestContext,
  makeAuthRequestContext,
  withCurrentUser,
  withRequestContext,
  type AuthPrincipal,
  type RequestContext,
};
