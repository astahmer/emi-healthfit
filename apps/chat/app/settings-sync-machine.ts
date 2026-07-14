import { assign, fromPromise, setup } from "xstate";
import { syncThreads } from "./sessions";

export interface SettingsSyncContext {
  status: string | null;
}

export type SettingsSyncEvent = { type: "sync" };

export const settingsSyncMachine = setup({
  types: {
    context: {} as SettingsSyncContext,
    events: {} as SettingsSyncEvent,
  },
  actors: {
    sync: fromPromise(async (): Promise<void> => {
      await syncThreads();
    }),
  },
}).createMachine({
  id: "settingsSync",
  initial: "idle",
  context: { status: null },
  states: {
    idle: {
      on: { sync: "syncing" },
    },
    syncing: {
      entry: assign({ status: () => null }),
      invoke: {
        src: "sync",
        onDone: {
          target: "success",
          actions: assign({ status: () => "Sessions synced" }),
        },
        onError: {
          target: "error",
          actions: assign({
            status: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },
    success: {
      on: { sync: "syncing" },
    },
    error: {
      on: { sync: "syncing" },
    },
  },
});
