import { createActor, setup } from "xstate";
import { getShortestPaths } from "xstate/graph";
import { describe, expect, it } from "vitest";

/**
 * Path-coverage twin of sidebarItemMachine without `after` / invoke —
 * `createTestModel` / graph validation rejects those on production machines.
 * Behavioral coverage of actors stays in sidebar-item-machine.test.ts.
 */
const sidebarPathMachine = setup({
  types: {
    events: {} as
      | { type: "rename.start" }
      | { type: "rename.change"; value: string }
      | { type: "rename.submit" }
      | { type: "rename.cancel" }
      | { type: "delete.request" }
      | { type: "delete.confirm" }
      | { type: "delete.cancel" }
      | { type: "copy.markdown" }
      | { type: "share" }
      | { type: "download" }
      | { type: "pin.toggle" }
      | { type: "archive" }
      | { type: "restore" }
      | { type: "clone" }
      | { type: "done" },
  },
}).createMachine({
  id: "sidebarItemPath",
  initial: "idle",
  states: {
    idle: {
      on: {
        "rename.start": "renaming",
        "delete.request": "confirmingDelete",
        "copy.markdown": "copying",
        share: "sharing",
        download: "downloading",
        "pin.toggle": "pinning",
        archive: "archiving",
        restore: "restoring",
        clone: "cloning",
      },
    },
    renaming: {
      on: {
        "rename.change": undefined,
        "rename.cancel": "idle",
        "rename.submit": "submittingRename",
      },
    },
    submittingRename: { on: { done: "idle" } },
    confirmingDelete: {
      on: {
        "delete.cancel": "idle",
        "delete.confirm": "deleting",
      },
    },
    deleting: { on: { done: "deleted" } },
    deleted: { type: "final" },
    copying: { on: { done: "idle" } },
    sharing: { on: { done: "idle" } },
    downloading: { on: { done: "idle" } },
    pinning: { on: { done: "idle" } },
    archiving: { on: { done: "idle" } },
    restoring: { on: { done: "idle" } },
    cloning: { on: { done: "idle" } },
  },
});

describe("sidebarItemMachine paths", () => {
  const paths = getShortestPaths(sidebarPathMachine, {
    events: [
      { type: "rename.start" },
      { type: "rename.change", value: "New title" },
      { type: "rename.submit" },
      { type: "rename.cancel" },
      { type: "delete.request" },
      { type: "delete.confirm" },
      { type: "delete.cancel" },
      { type: "copy.markdown" },
      { type: "share" },
      { type: "download" },
      { type: "pin.toggle" },
      { type: "archive" },
      { type: "restore" },
      { type: "clone" },
      { type: "done" },
    ],
    serializeState: (state) => JSON.stringify(state.value),
  });

  for (const path of paths) {
    it(`reaches ${JSON.stringify(path.state.value)}`, () => {
      const actor = createActor(sidebarPathMachine).start();
      for (const step of path.steps) {
        actor.send(step.event);
      }
      expect(actor.getSnapshot().value).toEqual(path.state.value);
      actor.stop();
    });
  }
});
