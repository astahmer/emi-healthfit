import type { D1Database } from "@cloudflare/workers-types";
import { createAnonymousEmail, type AuthDatabaseSchema } from "@emi/core/server";
import type { Compilable } from "kysely";
import { makeD1Kysely } from "../db/client.ts";

export const anonymousSignInPath = "/api/auth/sign-in/anonymous";

const sessionDurationSeconds = 60 * 60 * 24 * 7;

const toD1Value = (value: unknown): string | number | null => {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return Number(value);
  if (value instanceof Date) return value.getTime();
  throw new Error("Unsupported D1 parameter");
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

const createSignature = async ({
  secret,
  value,
}: {
  secret: string;
  value: string;
}): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

export const createSessionCookie = async ({
  baseUrl,
  secret,
  token,
}: {
  baseUrl: string;
  secret: string;
  token: string;
}): Promise<string> => {
  const secure = baseUrl.startsWith("https://");
  const name = `${secure ? "__Secure-" : ""}better-auth.session_token`;
  const signature = await createSignature({ secret, value: token });
  const value = encodeURIComponent(`${token}.${signature}`);
  return `${name}=${value}; Max-Age=${sessionDurationSeconds}; Path=/; HttpOnly${secure ? "; Secure" : ""}; SameSite=Lax`;
};

export const createAnonymousSessionResponse = async ({
  baseUrl,
  database,
  request,
  secret,
}: {
  baseUrl: string;
  database: D1Database;
  request: Request;
  secret: string;
}): Promise<Response> => {
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
  const kysely = makeD1Kysely<AuthDatabaseSchema>(database);

  await database.batch([
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
  ]);

  const cookie = await createSessionCookie({ baseUrl, secret, token });
  return Response.json(
    { user: { id: userId, name: "Guest" } },
    { status: 201, headers: { "set-cookie": cookie } },
  );
};
