import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { Miniflare } from "miniflare";
import * as Effect from "effect/Effect";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";

const {
  createAnonymousEmail,
  createAgentSessionResponseEffect,
  createAnonymousSessionResponseEffect,
  createSessionCookie,
  createSessionCookieEffect,
  errors: { AuthError },
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  isLocalAgentAuthUrl,
  isProtectedPath,
  isTrustedAuthOrigin,
  makeAuth,
  makeAuthRequestContext: makeRequestContext,
  parseAllowedEmails,
} = CoreCloudflare.auth;
const { CurrentRequestContext, withRequestContext } = CoreCloudflare.request;

describe("authentication boundaries", () => {
  it("keeps authentication configuration failures tagged", async () => {
    await assert.rejects(
      () =>
        Effect.runPromise(
          CoreCloudflare.auth.getAuthConfiguration({
            environment: {
              BETTER_AUTH_SECRET: "a secure test secret with at least 32 bytes",
              BETTER_AUTH_URL: "https://app.example.com",
              GOOGLE_CLIENT_ID: "google-client-id",
              GOOGLE_CLIENT_SECRET: "google-client-secret",
            },
            policy: "anonymous",
          }),
        ),
      (error: unknown) =>
        error instanceof AuthError && error._tag === "AuthError" && error.phase === "configuration",
    );
  });

  it("builds RequestContext from the authenticated principal", async () => {
    const requestContext = makeRequestContext({
      principal: {
        id: "user-1",
        email: "coach@example.com",
        name: "Coach",
        image: null,
      },
      requestId: "request-1",
    });
    assert.deepEqual(requestContext, { userId: "user-1", requestId: "request-1" });

    const observed = await Effect.runPromise(
      withRequestContext({
        requestContext,
        effect: Effect.gen(function* () {
          return yield* CurrentRequestContext;
        }),
      }),
    );
    assert.deepEqual(observed, requestContext);
  });

  it("normalizes and deduplicates configured emails", () => {
    assert.deepEqual(
      [...parseAllowedEmails(" Coach@Example.com,coach@example.com , second@example.com")],
      ["coach@example.com", "second@example.com"],
    );
  });

  it("only recognizes generated guest addresses as anonymous", () => {
    const email = createAnonymousEmail({ id: "8c75583b-0b8d-4bda-97e4-6cd7286f1378" });

    assert.equal(isAnonymousEmail(email), true);
    assert.equal(isAnonymousEmail(email.toUpperCase()), true);
    assert.equal(isAnonymousEmail("guest@example.com"), false);
    assert.equal(isAnonymousEmail("guest-not-a-uuid@anonymous.emi.invalid"), false);
  });

  it("authorizes anonymous users and verified allowlisted Google users", () => {
    const allowedEmails = new Set(["coach@example.com"]);
    const anonymousEmail = createAnonymousEmail({
      id: "8c75583b-0b8d-4bda-97e4-6cd7286f1378",
    });

    assert.equal(
      isAuthorizedAuthEmail({ allowedEmails, email: anonymousEmail, emailVerified: false }),
      true,
    );
    assert.equal(
      isAuthorizedAuthEmail({
        allowedEmails,
        email: "coach@example.com",
        emailVerified: true,
      }),
      true,
    );
    assert.equal(
      isAuthorizedAuthEmail({
        allowedEmails,
        email: "coach@example.com",
        emailVerified: false,
      }),
      false,
    );
    assert.equal(
      isAuthorizedAuthEmail({ allowedEmails, email: "other@example.com", emailVerified: true }),
      false,
    );
  });

  it("accepts anonymous session creation only from the configured origin", () => {
    assert.equal(
      isTrustedAuthOrigin({
        baseUrl: "https://app.example.com",
        origin: "https://app.example.com",
      }),
      true,
    );
    assert.equal(
      isTrustedAuthOrigin({
        baseUrl: "https://app.example.com",
        origin: "https://evil.example.com",
      }),
      false,
    );
    assert.equal(isTrustedAuthOrigin({ baseUrl: "https://app.example.com", origin: null }), false);
  });

  it("creates a Better Auth-compatible signed session cookie", async () => {
    const secret = "a secure test secret with at least 32 bytes";
    const token = "anonymous-session-token";
    const cookieFromEffect = await Effect.runPromise(
      createSessionCookieEffect({
        baseUrl: "https://app.example.com",
        secret,
        token,
      }),
    );
    const cookie = await createSessionCookie({
      baseUrl: "https://app.example.com",
      secret,
      token,
    });
    assert.equal(cookie, cookieFromEffect);
    const encodedValue = cookie.split(";", 1)[0]?.split("=", 2)[1];
    assert.notEqual(encodedValue, undefined);
    const [signedToken, signature] = decodeURIComponent(encodedValue ?? "").split(".");
    assert.equal(signedToken, token);
    assert.notEqual(signature, undefined);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureBytes = Uint8Array.from(atob(signature ?? ""), (character) =>
      character.charCodeAt(0),
    );
    assert.equal(
      await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(token)),
      true,
    );
    assert.match(cookie, /^__Secure-better-auth\.session_token=/);
    assert.match(cookie, /; HttpOnly; Secure; SameSite=Lax$/);
  });

  it("creates a normal Better Auth session through the local headless agent path", async () => {
    const miniflare = new Miniflare({
      compatibilityDate: "2026-07-10",
      d1Databases: ["DB"],
      modules: true,
      script: 'export default { fetch: () => new Response("ok") }',
    });

    try {
      const database = await miniflare.getD1Database("DB");
      const authMigration = await readFile(
        new URL("../migrations/20260802113108_add-auth-tables.sql", import.meta.url),
        "utf8",
      );
      const migrationStatements = authMigration
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement !== "");
      await database.batch(migrationStatements.map((statement) => database.prepare(statement)));
      const baseUrl = "http://localhost:1337";
      const secret = "a secure test secret with at least 32 bytes";
      const agentSecret = "a local agent secret with at least 32 bytes";
      const configuration = {
        agent: { email: "coach@example.com", secret: agentSecret },
        allowedEmails: new Set(["coach@example.com"]),
        appName: "Emi HealthFit",
        baseUrl,
        google: {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
        },
        secret,
      };
      const auth = makeAuth({ database, configuration });

      assert.equal(isLocalAgentAuthUrl({ baseUrl }), true);
      assert.equal(isLocalAgentAuthUrl({ baseUrl: "https://emi-healthfit.astahmer.dev" }), false);
      const unauthorized = await Effect.runPromise(
        createAgentSessionResponseEffect({
          configuration,
          database,
          request: new Request(`${baseUrl}/api/auth/sign-in/agent`, {
            headers: { authorization: "Bearer wrong" },
            method: "POST",
          }),
        }),
      );
      assert.equal(unauthorized.status, 401);

      const response = await Effect.runPromise(
        createAgentSessionResponseEffect({
          configuration,
          database,
          request: new Request(`${baseUrl}/api/auth/sign-in/agent`, {
            headers: { authorization: `Bearer ${agentSecret}` },
            method: "POST",
          }),
        }),
      );
      assert.equal(response.status, 201);
      const setCookie = response.headers.get("set-cookie");
      assert.notEqual(setCookie, null);
      const cookie = setCookie?.split(";", 1)[0] ?? "";
      const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
      assert.equal(session?.user.email, "coach@example.com");
      assert.equal(session?.user.name, "Local agent");
    } finally {
      await miniflare.dispose();
    }
  });

  it("creates an app-owned guest that Better Auth can read and revoke", async () => {
    const miniflare = new Miniflare({
      compatibilityDate: "2026-07-10",
      d1Databases: ["DB"],
      modules: true,
      script: 'export default { fetch: () => new Response("ok") }',
    });

    try {
      const database = await miniflare.getD1Database("DB");
      const authMigration = await readFile(
        new URL("../migrations/20260802113108_add-auth-tables.sql", import.meta.url),
        "utf8",
      );
      const migrationStatements = authMigration
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement !== "");
      await database.batch(migrationStatements.map((statement) => database.prepare(statement)));
      const baseUrl = "https://app.example.com";
      const secret = "a secure test secret with at least 32 bytes";
      const response = await Effect.runPromise(
        createAnonymousSessionResponseEffect({
          baseUrl,
          database,
          request: new Request(`${baseUrl}/api/auth/sign-in/anonymous`, {
            method: "POST",
            headers: { origin: baseUrl, "user-agent": "auth-integration-test" },
          }),
          secret,
        }),
      );

      assert.equal(response.status, 201);
      const setCookie = response.headers.get("set-cookie");
      assert.notEqual(setCookie, null);
      const cookie = setCookie?.split(";", 1)[0] ?? "";
      const auth = makeAuth({
        database,
        configuration: {
          appName: "Emi HealthFit",
          allowedEmails: new Set(["coach@example.com"]),
          baseUrl,
          secret,
          google: {
            clientId: "google-client-id",
            clientSecret: "google-client-secret",
          },
        },
      });
      const session = await auth.api.getSession({ headers: new Headers({ cookie }) });

      assert.equal(session?.user.name, "Guest");
      assert.equal(isAnonymousEmail(session?.user.email ?? ""), true);
      assert.equal(
        await database.prepare("SELECT COUNT(*) FROM auth_user").first<number>("COUNT(*)"),
        1,
      );
      assert.equal(
        await database.prepare("SELECT COUNT(*) FROM auth_session").first<number>("COUNT(*)"),
        1,
      );
      assert.equal(
        await database.prepare("SELECT COUNT(*) FROM auth_account").first<number>("COUNT(*)"),
        0,
      );

      const signOutResponse = await auth.api.signOut({
        headers: new Headers({ cookie }),
        asResponse: true,
      });
      assert.equal(signOutResponse.status, 200);
      assert.equal(
        await database.prepare("SELECT COUNT(*) FROM auth_session").first<number>("COUNT(*)"),
        0,
      );
    } finally {
      await miniflare.dispose();
    }
  });

  it("protects personal endpoints while leaving assets public", () => {
    for (const path of [
      "/api/chat",
      "/api/chat/id/stream",
      "/api/analytics/overview",
      "/api/export/ingested-data",
      "/api/import/ingested-data",
      "/api/privacy",
      "/api/workouts",
      "/api/conversations",
      "/api/notes",
      "/api/memories",
      "/ingest",
      "/chat",
    ]) {
      assert.equal(isProtectedPath(path), true, path);
    }
    assert.equal(isProtectedPath("/chat/session-id"), false);
    assert.equal(isProtectedPath("/icon.svg"), false);
  });
});
