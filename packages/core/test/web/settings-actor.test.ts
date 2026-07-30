import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import { settingsActor } from "../../src/web/chat-runtime/settings-actor.ts";

describe("settingsActor", () => {
  it("hydrates validated values and restores required model defaults", async () => {
    const actor = createActor(settingsActor, {
      input: {
        storageKey: "settings",
        storage: {
          getItem: () =>
            JSON.stringify({
              provider: "openai",
              apiKey: "key",
              baseUrl: "",
              model: "",
              systemPrompt: "Be brief.",
              titleModel: "",
              titlePrompt: "",
              memoryEnabled: false,
              memoryModel: "",
              theme: "dark",
            }),
          setItem: () => undefined,
        },
      },
    }).start();

    await vi.waitFor(() => expect(actor.getSnapshot().context.hydrated).toBe(true));
    expect(actor.getSnapshot().context.settings).toMatchObject({
      apiKey: "key",
      model: "gpt-4o-mini",
      titleModel: "gpt-4o-mini",
      theme: "dark",
    });
    actor.stop();
  });

  it("persists complete validated settings after a patch", async () => {
    const writes: Array<{ key: string; value: string }> = [];
    const actor = createActor(settingsActor, {
      input: {
        storageKey: "settings",
        storage: {
          getItem: () => null,
          setItem: (key, value) => writes.push({ key, value }),
        },
      },
    }).start();

    actor.send({ type: "settings-patch-requested", patch: { apiKey: "new-key", theme: "dark" } });

    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      key: "settings",
      value: expect.stringContaining('"apiKey":"new-key"'),
    });
    expect(actor.getSnapshot().context.settings.theme).toBe("dark");
    actor.stop();
  });
});
