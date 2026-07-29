import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromWeb } from "effect/unstable/http/HttpServerRequest";
import { readDemoPrincipalFromHeader } from "../../src/cloudflare/auth/request-auth.ts";

describe("readDemoPrincipalFromHeader", () => {
  it("ignores x-demo-user-id unless ALLOW_DEMO_USER_HEADER is exactly 1", () => {
    const request = fromWeb(
      new Request("https://app.example.com/api/conversations", {
        headers: { "x-demo-user-id": "attacker" },
      }),
    );
    assert.equal(readDemoPrincipalFromHeader({ environment: {}, request }), null);
    assert.equal(
      readDemoPrincipalFromHeader({ environment: { ALLOW_DEMO_USER_HEADER: "0" }, request }),
      null,
    );
    assert.equal(
      readDemoPrincipalFromHeader({ environment: { ALLOW_DEMO_USER_HEADER: "true" }, request }),
      null,
    );
  });

  it("accepts the demo header only when the flag is enabled", () => {
    const request = fromWeb(
      new Request("https://app.example.com/api/conversations", {
        headers: { "x-demo-user-id": "demo-user-1" },
      }),
    );
    assert.deepEqual(
      readDemoPrincipalFromHeader({
        environment: { ALLOW_DEMO_USER_HEADER: "1" },
        request,
      }),
      {
        id: "demo-user-1",
        email: "demo-demo-user-1@demo.local",
        name: "Demo",
        image: null,
      },
    );
  });

  it("rejects empty demo user ids even when the flag is on", () => {
    const request = fromWeb(
      new Request("https://app.example.com/api/conversations", {
        headers: { "x-demo-user-id": "" },
      }),
    );
    assert.equal(
      readDemoPrincipalFromHeader({
        environment: { ALLOW_DEMO_USER_HEADER: "1" },
        request,
      }),
      null,
    );
  });
});
