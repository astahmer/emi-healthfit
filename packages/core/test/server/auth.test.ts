import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAnonymousEmail,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  parseAllowedEmails,
} from "../../src/server/auth/emails.ts";
import { isGenericProtectedPath, isProtectedPath } from "../../src/server/auth/paths.ts";
import {
  CurrentUser,
  makeAuthRequestContext,
  withCurrentUser,
} from "../../src/server/auth/principal.ts";
import { CurrentRequestContext, withRequestContext } from "../../src/server/request-context.ts";
import * as Effect from "effect/Effect";

describe("core auth helpers", () => {
  it("builds RequestContext from the authenticated principal", async () => {
    const requestContext = makeAuthRequestContext({
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
        effect: withCurrentUser({
          principal: {
            id: "user-1",
            email: "coach@example.com",
            name: "Coach",
            image: null,
          },
          effect: Effect.gen(function* () {
            const user = yield* CurrentUser;
            const context = yield* CurrentRequestContext;
            return { user, context };
          }),
        }),
      }),
    );
    assert.equal(observed.user.id, "user-1");
    assert.deepEqual(observed.context, requestContext);
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
    assert.equal(isAnonymousEmail("guest@example.com"), false);
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
      isAuthorizedAuthEmail({ allowedEmails, email: "other@example.com", emailVerified: true }),
      false,
    );
  });

  it("protects HealthFit personal endpoints while leaving assets public", () => {
    assert.equal(isProtectedPath("/api/conversations"), true);
    assert.equal(isProtectedPath("/ingest"), true);
    assert.equal(isProtectedPath("/chat"), true);
    assert.equal(isProtectedPath("/icon.svg"), false);
  });

  it("protects generic API routes except health and auth", () => {
    assert.equal(isGenericProtectedPath("/api/conversations"), true);
    assert.equal(isGenericProtectedPath("/api/health"), false);
    assert.equal(isGenericProtectedPath("/api/releases"), false);
    assert.equal(isGenericProtectedPath("/api/settings"), false);
    assert.equal(isGenericProtectedPath("/api/auth/sign-in/anonymous"), false);
    assert.equal(isGenericProtectedPath("/icon.svg"), false);
  });
});
