import { assign, fromPromise, setup } from "xstate";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const UploadResultSchema = Schema.Struct({
  error: Schema.optional(Schema.String),
  health: Schema.optional(
    Schema.Struct({
      daily: Schema.Number,
      workouts: Schema.Number,
      sleep: Schema.Number,
      body: Schema.Number,
    }),
  ),
  hevy: Schema.optional(Schema.Struct({ sessions: Schema.Number, sets: Schema.Number })),
});

export type UploadResult = typeof UploadResultSchema.Type;

export interface UploadContext {
  healthFile: File | null;
  hevyFile: File | null;
  result: UploadResult | null;
  error: string | null;
}

export type UploadEvent =
  | { type: "selectHealth"; file: File | null }
  | { type: "selectHevy"; file: File | null }
  | { type: "submit" }
  | { type: "reset" };

const uploadFiles = async (
  healthFile: File | null,
  hevyFile: File | null,
): Promise<UploadResult> => {
  const form = new FormData();
  if (healthFile !== null) form.append("health_export", healthFile);
  if (hevyFile !== null) form.append("hevy_export", hevyFile);

  const res = await fetch(`${window.location.origin}/ingest`, {
    method: "POST",
    body: form,
  });
  const decoded = Schema.decodeUnknownOption(UploadResultSchema)(
    await res.json().catch(() => undefined),
  );
  if (Option.isNone(decoded)) throw new Error("Upload returned an invalid response.");

  if (!res.ok) throw new Error(decoded.value.error || "Upload failed.");
  return decoded.value;
};

export const uploadMachine = setup({
  types: {
    context: {} as UploadContext,
    events: {} as UploadEvent,
  },
  actors: {
    upload: fromPromise(({ input }: { input: Pick<UploadContext, "healthFile" | "hevyFile"> }) =>
      uploadFiles(input.healthFile, input.hevyFile),
    ),
  },
  guards: {
    hasFiles: ({ context }) => context.healthFile !== null || context.hevyFile !== null,
  },
}).createMachine({
  id: "upload",
  initial: "idle",
  context: {
    healthFile: null,
    hevyFile: null,
    result: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        selectHealth: {
          actions: assign({ healthFile: ({ event }) => event.file, error: () => null }),
        },
        selectHevy: {
          actions: assign({ hevyFile: ({ event }) => event.file, error: () => null }),
        },
        submit: [
          { guard: "hasFiles", target: "uploading" },
          { actions: assign({ error: () => "Please select at least one file." }) },
        ],
      },
    },
    uploading: {
      entry: assign({ error: () => null, result: () => null }),
      invoke: {
        src: "upload",
        input: ({ context }) => ({
          healthFile: context.healthFile,
          hevyFile: context.hevyFile,
        }),
        onDone: {
          target: "success",
          actions: assign({ result: ({ event }) => event.output }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },
    success: {
      entry: assign({ healthFile: () => null, hevyFile: () => null }),
      on: {
        selectHealth: {
          target: "idle",
          actions: assign({ healthFile: ({ event }) => event.file }),
        },
        selectHevy: { target: "idle", actions: assign({ hevyFile: ({ event }) => event.file }) },
        reset: { target: "idle" },
      },
    },
    error: {
      on: {
        selectHealth: {
          target: "idle",
          actions: assign({ healthFile: ({ event }) => event.file }),
        },
        selectHevy: { target: "idle", actions: assign({ hevyFile: ({ event }) => event.file }) },
        submit: { target: "uploading" },
        reset: { target: "idle" },
      },
    },
  },
});
