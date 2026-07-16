import type { D1Database } from "@cloudflare/workers-types";
import * as Schema from "effect/Schema";

export const anonymousSignInPath = "/api/auth/sign-in/anonymous";

const sessionDurationSeconds = 60 * 60 * 24 * 7;
const AnonymousEmail = Schema.String.check(
  Schema.isPattern(
    /^guest-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@anonymous\.emi\.invalid$/,
  ),
);

export const createAnonymousEmail = ({ id }: { id: string }): string =>
  `guest-${id}@anonymous.emi.invalid`;

export const isAnonymousEmail = (email: string): boolean =>
  Schema.is(AnonymousEmail)(email.trim().toLowerCase());

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

  await database.batch([
    database
      .prepare(
        "INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(userId, "Guest", createAnonymousEmail({ id: userId }), 0, now, now),
    database
      .prepare(
        "INSERT INTO auth_session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        sessionId,
        expiresAt,
        token,
        now,
        now,
        request.headers.get("cf-connecting-ip"),
        request.headers.get("user-agent"),
        userId,
      ),
  ]);

  const cookie = await createSessionCookie({ baseUrl, secret, token });
  return Response.json(
    { user: { id: userId, name: "Guest" } },
    { status: 201, headers: { "set-cookie": cookie } },
  );
};
