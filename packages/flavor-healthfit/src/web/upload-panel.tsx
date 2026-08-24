"use client";

import { useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { formatUploadResult } from "./upload-format.ts";
import { uploadMachine } from "./upload-machine.ts";

const dropZoneClasses =
  "mt-1 rounded-md border border-dashed border-input bg-background/60 px-3 py-4 text-sm transition-colors hover:border-primary/50 data-[dragover=true]:border-primary data-[dragover=true]:bg-primary/5";

const FileDropZone = ({
  id,
  label,
  accept,
  helper,
  inputRef,
  onFile,
}: {
  id: string;
  label: string;
  accept: string;
  helper: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File | null) => void;
}) => {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={dropZoneClasses}
        data-dragover={dragOver}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files.item(0);
          if (file !== null) onFile(file);
        }}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          onChange={(event) => {
            const files = event.target.files;
            const file = files !== null && files.length > 0 ? files.item(0) : null;
            onFile(file);
          }}
          className="block w-full cursor-pointer text-xs"
        />
        <p className="text-muted-foreground mt-2 text-xs">{helper}</p>
      </div>
    </div>
  );
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
    ? formatUploadResult(state.context.result)
    : state.context.error;

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-xl font-semibold">Upload data</h2>

      <div className="space-y-4">
        <FileDropZone
          id="health"
          label="HealthExportKit JSON"
          accept=".json,application/json"
          helper="From the HealthExportKit app export. Drag the file here or browse."
          inputRef={healthRef}
          onFile={(file) => send({ type: "selectHealth", file })}
        />

        <FileDropZone
          id="hevy"
          label="Hevy CSV"
          accept=".csv,text/csv"
          helper="From Hevy: Profile / Settings / Export & Import Data / Export Workouts."
          inputRef={hevyRef}
          onFile={(file) => send({ type: "selectHevy", file })}
        />

        <button
          type="button"
          onClick={() => send({ type: "submit" })}
          disabled={state.matches("uploading")}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
        >
          {state.matches("uploading") ? "Uploading..." : "Import data"}
        </button>

        {status !== null && status !== "" && (
          <div className="bg-muted whitespace-pre-wrap rounded-md p-3 text-sm">{status}</div>
        )}
      </div>
    </div>
  );
};
