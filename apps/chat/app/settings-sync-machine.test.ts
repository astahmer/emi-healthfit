import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { settingsSyncMachine } from "./settings-sync-machine";

describe("settingsSyncMachine", () => {
  it("starts idle with no status", () => {
    const actor = createActor(settingsSyncMachine);
    actor.start();

    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.status).toBeNull();
  });

  it("transitions to success after a successful sync", async () => {
    const machine = settingsSyncMachine.provide({
      actors: {
        sync: fromPromise(async (): Promise<void> => {}),
      },
    });
    const actor = createActor(machine);
    actor.start();

    actor.send({ type: "sync" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("success")).toBe(true));
    expect(actor.getSnapshot().context.status).toBe("Sessions synced");
  });

  it("transitions to error after a failed sync", async () => {
    const machine = settingsSyncMachine.provide({
      actors: {
        sync: fromPromise(async (): Promise<void> => {
          throw new Error("Sync failed");
        }),
      },
    });
    const actor = createActor(machine);
    actor.start();

    actor.send({ type: "sync" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("error")).toBe(true));
    expect(actor.getSnapshot().context.status).toBe("Sync failed");
  });

  it("allows retry from error state", async () => {
    let shouldFail = true;
    const machine = settingsSyncMachine.provide({
      actors: {
        sync: fromPromise(async (): Promise<void> => {
          if (shouldFail) {
            throw new Error("Sync failed");
          }
        }),
      },
    });
    const actor = createActor(machine);
    actor.start();

    actor.send({ type: "sync" });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("error")).toBe(true));

    shouldFail = false;
    actor.send({ type: "sync" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("success")).toBe(true));
    expect(actor.getSnapshot().context.status).toBe("Sessions synced");
  });
});
