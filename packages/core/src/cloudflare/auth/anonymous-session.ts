import type { D1Database } from "@cloudflare/workers-types";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { createAnonymousEmail } from "../../server/auth/emails.ts";
import type { AuthDatabaseSchema } from "../../server/db/auth-schema.ts";
import type { Compilable } from "kysely";
import { CloudflareDatabase } from "../db/client.ts";

export const anonymousSignInPath = "/api/auth/sign-in/anonymous";

const sessionDurationSeconds = 60 * 60 * 24 * 7;

export class AnonymousSessionError extends Schema.TaggedErrorClass<AnonymousSessionError>()(
  "AnonymousSessionError",
  { phase: Schema.Literals(["signing", "database"]), message: Schema.String },
) {}

const toD1Value = (value: unknown): string | number | null => {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return Number(value);
  if (value instanceof Date) return value.getTime();
  throw new AnonymousSessionError({
    phase: "database",
    message: "Unsupported D1 parameter",
  });
};

const compile = ({
  database,
  statement,
}: {
  database: D1Database;
  statement: Compilable<unknown>;
}) => {
  const compiled = statement.compile();
  return database.prepare(compiled.sql).bind(...compiled.parameters.map(toD1Value));
};

export const isTrustedAuthOrigin = ({
  baseUrl,
  origin,
}: {
  baseUrl: string;
  origin: string | null;
}): boolean => origin === new URL(baseUrl).origin;

const createSignature = Effect.fn("auth.anonymous.signature")(
  ({ secret, value }: { secret: string; value: string }) =>
    Effect.tryPromise({
      try: async () => {
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
        return btoa(String.fromCharCode(...new Uint8Array(signature)));
      },
      catch: (error) =>
        new AnonymousSessionError({
          phase: "signing",
          message: `Anonymous session signing failed: ${String(error)}`,
        }),
    }),
);

export const createSessionCookieEffect = Effect.fn("auth.anonymous.sessionCookie")(function* ({
  baseUrl,
  maxAgeSeconds = sessionDurationSeconds,
  secret,
  token,
}: {
  baseUrl: string;
  maxAgeSeconds?: number;
  secret: string;
  token: string;
}) {
  const secure = baseUrl.startsWith("https://");
  const name = `${secure ? "__Secure-" : ""}better-auth.session_token`;
  const signature = yield* createSignature({ secret, value: token });
  const value = encodeURIComponent(`${token}.${signature}`);
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly${secure ? "; Secure" : ""}; SameSite=Lax`;
});

export const createSessionCookie = (input: {
  baseUrl: string;
  secret: string;
  token: string;
}): Promise<string> => Effect.runPromise(createSessionCookieEffect(input));

export const createAnonymousSessionResponseEffect = Effect.fn("auth.anonymous.sessionResponse")(
  function* ({
    baseUrl,
    database,
    request,
    secret,
  }: {
    baseUrl: string;
    database: D1Database;
    request: Request;
    secret: string;
  }) {
    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { allow: "POST" } },
      );
    }
    if (!isTrustedAuthOrigin({ baseUrl, origin: request.headers.get("origin") })) {
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    }

    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const now = Date.now();
    const expiresAt = now + sessionDurationSeconds * 1000;
    const kysely = CloudflareDatabase.makeD1Kysely<AuthDatabaseSchema>(database);

    const statements = yield* Effect.try({
      try: () => [
        compile({
          database,
          statement: kysely.insertInto("auth_user").values({
            id: userId,
            name: "Guest",
            email: createAnonymousEmail({ id: userId }),
            email_verified: false,
            created_at: new Date(now),
            updated_at: new Date(now),
          }),
        }),
        compile({
          database,
          statement: kysely.insertInto("auth_session").values({
            id: sessionId,
            expires_at: new Date(expiresAt),
            token,
            created_at: new Date(now),
            updated_at: new Date(now),
            ip_address: request.headers.get("cf-connecting-ip"),
            user_agent: request.headers.get("user-agent"),
            user_id: userId,
          }),
        }),
      ],
      catch: (error) =>
        new AnonymousSessionError({
          phase: "database",
          message: `Anonymous session statement failed: ${String(error)}`,
        }),
    });
    yield* Effect.tryPromise({
      try: () => database.batch(statements),
      catch: (error) =>
        new AnonymousSessionError({
          phase: "database",
          message: `Anonymous session persistence failed: ${String(error)}`,
        }),
    });

    const cookie = yield* createSessionCookieEffect({ baseUrl, secret, token });
    return Response.json(
      { user: { id: userId, name: "Guest" } },
      { status: 201, headers: { "set-cookie": cookie } },
    );
  },
);

export const createAnonymousSessionResponse = (input: {
  baseUrl: string;
  database: D1Database;
  request: Request;
  secret: string;
}): Promise<Response> => Effect.runPromise(createAnonymousSessionResponseEffect(input));
