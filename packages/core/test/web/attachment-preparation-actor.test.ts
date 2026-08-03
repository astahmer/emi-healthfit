import type { FileUIPart } from "ai";
import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { attachmentPreparationMachine } from "../../src/web/attachments/attachment-preparation-actor.ts";

const files = [
  new File(["attachment"], "attachment.txt", { type: "text/plain" }),
] as unknown as FileList;

describe("attachmentPreparationMachine", () => {
  it("owns preparation and reports prepared parts to its adapter", async () => {
    const preparedParts: FileUIPart[] = [
      {
        type: "file",
        filename: "attachment.txt",
        mediaType: "text/plain",
        url: "data:text/plain;base64,YXR0YWNobWVudA==",
      },
    ];
    const onPrepared = vi.fn();
    const machine = attachmentPreparationMachine.provide({
      actors: {
        prepareParts: fromPromise(async (): Promise<ReadonlyArray<FileUIPart>> => preparedParts),
      },
    });
    const actor = createActor(machine, { input: { onPrepared } });
    actor.start();

    actor.send({ type: "files.selected", files, existingCount: 0 });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("idle")).toBe(true));
    expect(onPrepared).toHaveBeenCalledWith(preparedParts);
    expect(actor.getSnapshot().context.error).toBeNull();
  });

  it("keeps preparation errors in actor state", async () => {
    const machine = attachmentPreparationMachine.provide({
      actors: {
        prepareParts: fromPromise(async (): Promise<ReadonlyArray<FileUIPart>> => {
          throw new Error("bad attachment");
        }),
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();

    actor.send({ type: "files.selected", files, existingCount: 0 });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("idle")).toBe(true));
    expect(actor.getSnapshot().context.error).toBe("bad attachment");
  });
});
