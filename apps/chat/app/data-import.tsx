"use client";

import { useState } from "react";
import { FileUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImportCount {
  received: number;
  existing: number;
  new: number;
}

interface ImportPreview {
  groups: Record<string, ImportCount>;
  totals: ImportCount;
}

const labels: Record<string, string> = {
  dailyActivity: "Daily activity",
  healthWorkouts: "Health workouts",
  sleepSessions: "Sleep sessions",
  bodyMetrics: "Body metrics",
  hevySessions: "Hevy sessions",
  hevySets: "Hevy sets",
};

const requestPreview = async ({ file, apply }: { file: File; apply: boolean }) => {
  if (file.size > 25 * 1024 * 1024) throw new Error("Export must be smaller than 25 MB.");
  const response = await fetch(`/api/import/ingested-data?apply=${apply}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await file.text(),
  });
  const data = (await response.json()) as {
    preview?: ImportPreview;
    applied?: boolean;
    error?: string;
  };
  if (!response.ok || data.preview === undefined) {
    throw new Error(data.error ?? `Import failed (${response.status})`);
  }
  return data.preview;
};

export const DataImport = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inspect = async (selected: File) => {
    setFile(selected);
    setPreview(null);
    setStatus(null);
    setBusy(true);
    try {
      setPreview(await requestPreview({ file: selected, apply: false }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not inspect export.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (file === null) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await requestPreview({ file, apply: true });
      setPreview(result);
      setStatus(`Imported ${result.totals.received.toLocaleString()} records.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-sm font-medium">Restore ingested data</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Select an Emi HealthFit JSON export. Nothing is written until you confirm the preview.
      </p>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
        <FileUpIcon className="size-4" />
        {busy ? "Inspecting…" : "Choose JSON export"}
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected !== undefined) void inspect(selected);
            event.target.value = "";
          }}
        />
      </label>
      {preview !== null && (
        <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3 text-xs">
          {Object.entries(preview.groups).map(([key, item]) => (
            <div key={key} className="flex justify-between gap-3">
              <span>{labels[key] ?? key}</span>
              <span className="text-muted-foreground">
                {item.new.toLocaleString()} new · {item.existing.toLocaleString()} existing
              </span>
            </div>
          ))}
          <Button onClick={() => void apply()} disabled={busy} size="sm" className="mt-2 w-full">
            {busy ? "Importing…" : `Import ${preview.totals.received.toLocaleString()} records`}
          </Button>
        </div>
      )}
      {status !== null && <p className="mt-2 text-center text-xs">{status}</p>}
    </div>
  );
};
