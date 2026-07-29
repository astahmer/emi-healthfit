import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { uploadMachine, type UploadResult } from "@emi/flavor-healthfit/web";

describe("uploadMachine", () => {
  it("starts idle with empty files", () => {
    const actor = createActor(uploadMachine);
    actor.start();

    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.healthFile).toBeNull();
    expect(actor.getSnapshot().context.hevyFile).toBeNull();
    expect(actor.getSnapshot().context.error).toBeNull();
    expect(actor.getSnapshot().context.result).toBeNull();
  });

  it("accepts health and hevy file selections", () => {
    const actor = createActor(uploadMachine);
    actor.start();

    const healthFile = new File(["{}"], "health.json", { type: "application/json" });
    const hevyFile = new File(["a,b"], "hevy.csv", { type: "text/csv" });

    actor.send({ type: "selectHealth", file: healthFile });
    actor.send({ type: "selectHevy", file: hevyFile });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.healthFile).toBe(healthFile);
    expect(snapshot.context.hevyFile).toBe(hevyFile);
    expect(snapshot.context.error).toBeNull();
  });

  it("rejects submit when no files are selected", () => {
    const actor = createActor(uploadMachine);
    actor.start();

    actor.send({ type: "submit" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("idle")).toBe(true);
    expect(snapshot.context.error).toBe("Please select at least one file.");
  });

  it("transitions to success after a successful upload", async () => {
    const result: UploadResult = {
      health: { daily: 1, workouts: 2, sleep: 3, body: 4 },
      hevy: { sessions: 5, sets: 6 },
    };
    const machine = uploadMachine.provide({
      actors: {
        upload: fromPromise(async (): Promise<UploadResult> => result),
      },
    });
    const actor = createActor(machine);
    actor.start();

    const healthFile = new File(["{}"], "health.json", { type: "application/json" });
    actor.send({ type: "selectHealth", file: healthFile });
    actor.send({ type: "submit" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("success")).toBe(true));

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.result).toEqual(result);
    expect(snapshot.context.healthFile).toBeNull();
    expect(snapshot.context.hevyFile).toBeNull();
  });

  it("transitions to error after a failed upload", async () => {
    const machine = uploadMachine.provide({
      actors: {
        upload: fromPromise(async (): Promise<UploadResult> => {
          throw new Error("Network down");
        }),
      },
    });
    const actor = createActor(machine);
    actor.start();

    const hevyFile = new File(["a,b"], "hevy.csv", { type: "text/csv" });
    actor.send({ type: "selectHevy", file: hevyFile });
    actor.send({ type: "submit" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("error")).toBe(true));

    expect(actor.getSnapshot().context.error).toBe("Network down");
  });

  it("allows retry from error state", async () => {
    const result: UploadResult = { health: { daily: 1, workouts: 0, sleep: 0, body: 0 } };
    let shouldFail = true;
    const machine = uploadMachine.provide({
      actors: {
        upload: fromPromise(async (): Promise<UploadResult> => {
          if (shouldFail) {
            throw new Error("Failed");
          }
          return result;
        }),
      },
    });
    const actor = createActor(machine);
    actor.start();

    const healthFile = new File(["{}"], "health.json", { type: "application/json" });
    actor.send({ type: "selectHealth", file: healthFile });
    actor.send({ type: "submit" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("error")).toBe(true));

    shouldFail = false;
    actor.send({ type: "submit" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("success")).toBe(true));
    expect(actor.getSnapshot().context.result).toEqual(result);
  });
});
