"use client";

import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { uploadMachine, type UploadResult } from "./upload-machine.ts";

const formatResult = (result: UploadResult | null) => {
  if (result === null) return "";
  const health = result.health;
  const hevy = result.hevy;
  return `Uploaded!\nHealth: ${health?.daily ?? 0} daily, ${health?.workouts ?? 0} workouts, ${health?.sleep ?? 0} sleep, ${health?.body ?? 0} body\nHevy: ${hevy?.sessions ?? 0} sessions, ${hevy?.sets ?? 0} sets`;
};

export const UploadPanel = () => {
  const [state, send] = useMachine(uploadMachine);
  const healthRef = useRef<HTMLInputElement>(null);
  const hevyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.matches("success")) return;
    if (healthRef.current !== null) healthRef.current.value = "";
    if (hevyRef.current !== null) hevyRef.current.value = "";
  }, [state]);

  const status = state.matches("success")
    ? formatResult(state.context.result)
    : state.context.error;

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-xl font-semibold">Upload data</h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="health" className="text-sm font-medium">
            HealthExportKit JSON
          </label>
          <input
            ref={healthRef}
            id="health"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const files = event.target.files;
              const file = files !== null && files.length > 0 ? files.item(0) : null;
              send({ type: "selectHealth", file });
            }}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">From the HealthExportKit app export.</p>
        </div>

        <div>
          <label htmlFor="hevy" className="text-sm font-medium">
            Hevy CSV
          </label>
          <input
            ref={hevyRef}
            id="hevy"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const files = event.target.files;
              const file = files !== null && files.length > 0 ? files.item(0) : null;
              send({ type: "selectHevy", file });
            }}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            From Hevy: Profile → Settings → Export & Import Data → Export Workouts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => send({ type: "submit" })}
          disabled={state.matches("uploading")}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
        >
          {state.matches("uploading") ? "Uploading…" : "Upload"}
        </button>

        {status !== null && status !== "" && (
          <div className="bg-muted whitespace-pre-wrap rounded-md p-3 text-sm">{status}</div>
        )}
      </div>
    </div>
  );
};
