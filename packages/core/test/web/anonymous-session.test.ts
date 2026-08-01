import { describe, expect, it } from "vitest";

import {
  anonymousSignInPath,
  createAnonymousSessionFetch,
  startAnonymousSession,
} from "../../src/web/auth/anonymous-session.ts";

describe("anonymous web session adapter", () => {
  it("starts a guest session with credentials included", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(null, { status: 201 });
    };

    expect(await startAnonymousSession({ apiOrigin: "https://chat.example/", fetch })).toBe(true);
    expect(requests).toEqual([
      {
        url: `https://chat.example${anonymousSignInPath}`,
        init: { credentials: "include", method: "POST" },
      },
    ]);
  });

  it("shares one guest bootstrap across concurrent protected requests", async () => {
    const requests: string[] = [];
    let authCalls = 0;
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith(anonymousSignInPath)) {
        authCalls += 1;
        return new Response(null, { status: 201 });
      }
      if (authCalls === 0)
        return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
      return new Response(JSON.stringify({ conversations: [] }), {
        headers: { "content-type": "application/json" },
      });
    };
    const authenticatedFetch = createAnonymousSessionFetch({
      apiOrigin: "https://chat.example",
      fetch,
    });

    await Promise.all([
      authenticatedFetch("https://chat.example/api/conversations"),
      authenticatedFetch("https://chat.example/api/memories"),
    ]);

    expect(requests.filter((url) => url.endsWith(anonymousSignInPath))).toHaveLength(1);
    expect(requests.filter((url) => url.includes("/api/conversations"))).toHaveLength(2);
    expect(requests.filter((url) => url.includes("/api/memories"))).toHaveLength(2);
  });

  it("keeps the original unauthorized response when guest bootstrap fails", async () => {
    const response = new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
    const authenticatedFetch = createAnonymousSessionFetch({
      apiOrigin: "https://chat.example",
      fetch: async (input) =>
        String(input).endsWith(anonymousSignInPath)
          ? new Response(null, { status: 503 })
          : response,
    });

    expect((await authenticatedFetch("https://chat.example/api/conversations")).status).toBe(401);
  });
});
