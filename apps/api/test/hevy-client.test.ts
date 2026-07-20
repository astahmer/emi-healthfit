import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Effect } from "effect";
import { HevyHttpError, createHevyClient } from "../src/healthfit/integrations/hevy/hevy-client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Hevy Effect client", () => {
  it("validateConnection returns typed user info", async () => {
    const requests: Array<{ url: string; apiKey: string | null }> = [];

    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      requests.push({ url, apiKey: headers.get("api-key") });
      return Response.json({
        data: { id: "user-1", name: "Ada", url: "https://hevy.com/user/ada" },
      });
    };

    const client = createHevyClient({ apiKey: "test-key" });
    const result = await Effect.runPromise(client.validateConnection());

    assert.equal(requests.length, 1);
    assert.match(requests[0]?.url ?? "", /\/v1\/user\/info$/);
    assert.equal(requests[0]?.apiKey, "test-key");
    assert.equal(result.data?.id, "user-1");
    assert.equal(result.data?.name, "Ada");
  });

  it("getWorkout requests the workout id path", async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      assert.match(url, /\/v1\/workouts\/workout-42$/);
      return Response.json({
        id: "workout-42",
        title: "Morning",
        exercises: [],
      });
    };

    const client = createHevyClient({ apiKey: "test-key" });
    const workout = await Effect.runPromise(client.getWorkout({ workoutId: "workout-42" }));
    assert.equal(workout.id, "workout-42");
  });

  it("maps HTTP error status to HevyHttpError without leaking bodies", async () => {
    globalThis.fetch = async () =>
      Response.json({ error: "secret upstream body", api_key: "should-not-leak" }, { status: 401 });

    const client = createHevyClient({ apiKey: "test-key" });
    const error = await Effect.runPromise(client.validateConnection().pipe(Effect.flip));

    assert.ok(error instanceof HevyHttpError);
    assert.equal(error.status, 401);
    assert.equal(error.message, "Hevy API request failed with status 401");
    assert.equal(JSON.stringify(error).includes("secret"), false);
    assert.equal(JSON.stringify(error).includes("test-key"), false);
  });

  it("listWorkoutEvents forwards since query", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      assert.equal(url.searchParams.get("since"), "2026-07-01T00:00:00Z");
      assert.equal(url.searchParams.get("page"), "1");
      assert.equal(url.searchParams.get("pageSize"), "10");
      return Response.json({
        page: 1,
        page_count: 1,
        events: [],
      });
    };

    const client = createHevyClient({ apiKey: "test-key" });
    const events = await Effect.runPromise(
      client.listWorkoutEvents({
        page: 1,
        pageSize: 10,
        since: "2026-07-01T00:00:00Z",
      }),
    );
    assert.equal(events.page, 1);
    assert.deepEqual(events.events, []);
  });
});
