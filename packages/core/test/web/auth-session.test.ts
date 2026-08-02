import { describe, expect, it } from "vitest";

import { AuthSession } from "../../src/web/auth/auth-session.ts";

const waitForStatus = async (
  session: AuthSession,
  status: "signed-out" | "starting" | "authenticated" | "error",
) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (session.getState() === status) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(session.getState()).toBe(status);
};

describe("AuthSession", () => {
  it("keeps guest and OAuth transitions in the actor-owned state", async () => {
    const calls: string[] = [];
    const session = new AuthSession({
      signInAsGuest: async () => {
        calls.push("guest");
        return true;
      },
      signInWithOAuth: async () => {
        calls.push("oauth");
        return true;
      },
    });

    expect(session.getState()).toBe("signed-out");
    session.signInAsGuest();
    await waitForStatus(session, "authenticated");
    expect(calls).toEqual(["guest"]);

    session.dispose();
  });

  it("keeps failed authentication retryable without exposing XState", async () => {
    let attempts = 0;
    const session = new AuthSession({
      signInAsGuest: async () => {
        attempts += 1;
        return attempts > 1;
      },
      signInWithOAuth: async () => false,
    });

    session.signInAsGuest();
    await waitForStatus(session, "error");
    session.signInAsGuest();
    await waitForStatus(session, "authenticated");
    expect(attempts).toBe(2);

    session.dispose();
  });
});
