"use client";

import { useEffect, useState } from "react";
import { ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PrivacyControls = () => {
  const [retentionDays, setRetentionDays] = useState(30);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/privacy", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load privacy settings");
        const data = (await response.json()) as { rawUploadRetentionDays: number };
        setRetentionDays(data.rawUploadRetentionDays);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setStatus(reason instanceof Error ? reason.message : "Could not load privacy settings");
      });
    return () => controller.abort();
  }, []);

  const saveRetention = async () => {
    setBusy("retention");
    setStatus(null);
    try {
      const response = await fetch("/api/privacy", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawUploadRetentionDays: retentionDays }),
      });
      if (!response.ok) throw new Error("Could not save retention policy");
      const result = (await response.json()) as { deletedRawUploads: number };
      setStatus(`Retention saved. Removed ${result.deletedRawUploads} expired raw upload(s).`);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not save retention policy");
    } finally {
      setBusy(null);
    }
  };

  const deleteSource = async (source: "health" | "hevy") => {
    const label = source === "health" ? "Apple Health" : "Hevy";
    if (!window.confirm(`Permanently delete all ${label} records and raw uploads?`)) return;
    setBusy(source);
    setStatus(null);
    try {
      const response = await fetch(`/api/privacy/data/${source}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Could not delete ${label} data`);
      setStatus(`${label} records and raw uploads deleted.`);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : `Could not delete ${label} data`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="size-4" />
        <h3 className="text-sm font-medium">Privacy and retention</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Parsed health records remain available until you delete them. Raw uploaded files expire on
        this schedule.
      </p>
      <div className="mt-3 flex gap-2">
        <select
          aria-label="Raw upload retention"
          value={retentionDays}
          onChange={(event) => setRetentionDays(Number(event.target.value))}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm"
        >
          <option value={0}>Do not retain raw uploads</option>
          <option value={7}>Retain for 7 days</option>
          <option value={30}>Retain for 30 days</option>
          <option value={90}>Retain for 90 days</option>
          <option value={365}>Retain for 1 year</option>
        </select>
        <Button onClick={() => void saveRetention()} disabled={busy !== null} variant="outline">
          {busy === "retention" ? "Applying…" : "Save"}
        </Button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button
          onClick={() => void deleteSource("health")}
          disabled={busy !== null}
          variant="destructive"
          className="gap-2"
        >
          <Trash2Icon className="size-4" /> Delete Apple Health
        </Button>
        <Button
          onClick={() => void deleteSource("hevy")}
          disabled={busy !== null}
          variant="destructive"
          className="gap-2"
        >
          <Trash2Icon className="size-4" /> Delete Hevy
        </Button>
      </div>
      {status !== null && <p className="mt-3 text-xs text-muted-foreground">{status}</p>}
    </div>
  );
};
