import type { D1Database } from "@cloudflare/workers-types";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { isAuthorizedAuthEmail } from "../../server/auth/emails.ts";
import { createSessionCookieEffect } from "./anonymous-session.ts";
import { makeAuth, type AuthConfiguration } from "./make-auth.ts";

export const agentSignInPath = "/api/auth/sign-in/agent";

export class AgentSessionError extends Schema.TaggedErrorClass<AgentSessionError>()(
  "AgentSessionError",
  {
    phase: Schema.Literals(["configuration", "request", "session"]),
    message: Schema.String,
  },
) {}

export const isLocalAgentAuthUrl = ({ baseUrl }: { baseUrl: string }): boolean => {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
};

const unavailableResponse = (): Response =>
  Response.json({ error: "Local agent authentication is unavailable" }, { status: 404 });

export const createAgentSessionResponseEffect = Effect.fn("auth.agentSessionResponse")(function* ({
  configuration,
  database,
  request,
}: {
  configuration: AuthConfiguration;
  database: D1Database;
  request: Request;
}) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { allow: "POST" } },
    );
  }
  if (
    !isLocalAgentAuthUrl({ baseUrl: configuration.baseUrl }) ||
    configuration.agent === undefined
  ) {
    return unavailableResponse();
  }
  if (request.headers.get("authorization") !== `Bearer ${configuration.agent.secret}`) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!configuration.allowedEmails.has(configuration.agent.email)) {
    return Response.json({ error: "Configured agent account is not allowlisted" }, { status: 403 });
  }

  const auth = makeAuth({ database, configuration });
  const context = yield* Effect.tryPromise({
    try: () => auth.$context,
    catch: (error) =>
      new AgentSessionError({
        phase: "session",
        message: `Authentication context failed: ${String(error)}`,
      }),
  });
  const account = yield* Effect.tryPromise({
    try: () =>
      context.internalAdapter.findUserByEmail(configuration.agent?.email ?? "", {
        includeAccounts: false,
      }),
    catch: (error) =>
      new AgentSessionError({
        phase: "session",
        message: `Agent account lookup failed: ${String(error)}`,
      }),
  });
  let user = account?.user;
  if (user === undefined) {
    user = yield* Effect.tryPromise({
      try: () =>
        context.internalAdapter.createUser({
          email: configuration.agent?.email ?? "",
          emailVerified: true,
          name: "Local agent",
        }),
      catch: (error) =>
        new AgentSessionError({
          phase: "session",
          message: `Agent account creation failed: ${String(error)}`,
        }),
    });
  }
  if (
    !isAuthorizedAuthEmail({
      allowedEmails: configuration.allowedEmails,
      email: user.email,
      emailVerified: user.emailVerified,
    })
  ) {
    return Response.json({ error: "Configured agent account is not authorized" }, { status: 403 });
  }

  const session = yield* Effect.tryPromise({
    try: () => context.internalAdapter.createSession(user.id),
    catch: (error) =>
      new AgentSessionError({
        phase: "session",
        message: `Agent session creation failed: ${String(error)}`,
      }),
  });
  const maxAgeSeconds = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  const cookie = yield* createSessionCookieEffect({
    baseUrl: configuration.baseUrl,
    maxAgeSeconds,
    secret: configuration.secret,
    token: session.token,
  });
  return Response.json(
    {
      expiresAt: session.expiresAt.toISOString(),
      user: {
        email: user.email,
        id: user.id,
        name: user.name,
      },
    },
    { status: 201, headers: { "set-cookie": cookie } },
  );
});

export const createAgentSessionResponse = (input: {
  configuration: AuthConfiguration;
  database: D1Database;
  request: Request;
}): Promise<Response> => Effect.runPromise(createAgentSessionResponseEffect(input));
