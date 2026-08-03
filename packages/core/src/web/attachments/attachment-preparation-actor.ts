import type { FileUIPart } from "ai";
import { assign, fromPromise, setup } from "xstate";
import { prepareAttachmentParts } from "./attachments.ts";

export interface AttachmentPreparationInput {
  readonly onPrepared?: (parts: ReadonlyArray<FileUIPart>) => void;
}

export interface AttachmentPreparationContext {
  readonly error: string | null;
  readonly onPrepared?: (parts: ReadonlyArray<FileUIPart>) => void;
}

export type AttachmentPreparationEvent = {
  readonly type: "files.selected";
  readonly files: FileList;
  readonly existingCount: number;
};

export const attachmentPreparationMachine = setup({
  types: {
    context: {} as AttachmentPreparationContext,
    events: {} as AttachmentPreparationEvent,
    input: {} as AttachmentPreparationInput,
  },
  actors: {
    prepareParts: fromPromise(
      async ({
        input,
      }: {
        input: { files: FileList; existingCount: number };
      }): Promise<ReadonlyArray<FileUIPart>> => prepareAttachmentParts(input),
    ),
  },
}).createMachine({
  id: "attachmentPreparation",
  initial: "idle",
  context: ({ input }) => ({
    error: null,
    onPrepared: input.onPrepared,
  }),
  states: {
    idle: {
      on: {
        "files.selected": {
          target: "preparing",
          actions: assign({ error: () => null }),
        },
      },
    },
    preparing: {
      invoke: {
        src: "prepareParts",
        input: ({ event }) => {
          if (event.type !== "files.selected") throw new Error("Unexpected event");
          return { files: event.files, existingCount: event.existingCount };
        },
        onDone: {
          target: "idle",
          actions: ({ context, event }) => context.onPrepared?.(event.output),
        },
        onError: {
          target: "idle",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },
  },
});
