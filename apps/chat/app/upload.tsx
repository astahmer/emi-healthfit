"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

interface UploadResult {
  error?: string;
  health?: { daily: number; workouts: number; sleep: number; body: number };
  hevy?: { sessions: number; sets: number };
}

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
  const json = (await res.json().catch(() => ({}))) as UploadResult;

  if (!res.ok) throw new Error(json.error || "Upload failed.");
  return json;
};

export function UploadPanel() {
  const [healthFile, setHealthFile] = useState<File | null>(null);
  const [hevyFile, setHevyFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const healthRef = useRef<HTMLInputElement>(null);
  const hevyRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: () => uploadFiles(healthFile, hevyFile),
    onSuccess: (json) => {
      setStatus(
        `Uploaded!\nHealth: ${json.health?.daily ?? 0} daily, ${json.health?.workouts ?? 0} workouts, ${json.health?.sleep ?? 0} sleep, ${json.health?.body ?? 0} body\nHevy: ${json.hevy?.sessions ?? 0} sessions, ${json.hevy?.sets ?? 0} sets`,
      );
      setHealthFile(null);
      setHevyFile(null);
      if (healthRef.current !== null) healthRef.current.value = "";
      if (hevyRef.current !== null) hevyRef.current.value = "";
    },
    onError: (err) => {
      setStatus(err instanceof Error ? err.message : String(err));
    },
  });

  const handleSubmit = () => {
    if (healthFile === null && hevyFile === null) {
      setStatus("Please select at least one file.");
      return;
    }
    setStatus("Uploading…");
    void uploadMutation.mutate();
  };

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
            onChange={(e) => setHealthFile(e.target.files?.[0] ?? null)}
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
            onChange={(e) => setHevyFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            From Hevy: Profile → Settings → Export & Import Data → Export Workouts.
          </p>
        </div>

        <Button onClick={handleSubmit} disabled={uploadMutation.isPending} className="w-full">
          {uploadMutation.isPending ? "Uploading…" : "Upload"}
        </Button>

        {status !== "" && (
          <div className="bg-muted whitespace-pre-wrap rounded-md p-3 text-sm">{status}</div>
        )}
      </div>
    </div>
  );
}
