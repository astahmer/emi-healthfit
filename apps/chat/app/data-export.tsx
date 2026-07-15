"use client";

import { useEffect, useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportSummary {
  totalRecords: number;
  healthRange: { first: string | null; last: string | null };
  hevyRange: { first: string | null; last: string | null };
}

const formatRange = (range: ExportSummary["healthRange"]) => {
  if (range.first === null || range.last === null) return "No records";
  return `${new Date(range.first).toLocaleDateString()} – ${new Date(range.last).toLocaleDateString()}`;
};

export const DataExport = () => {
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/export/ingested-data/summary", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not summarize export (${response.status})`);
        const data = (await response.json()) as { summary: ExportSummary };
        setSummary(data.summary);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Could not summarize export.");
        }
      });
    return () => controller.abort();
  }, []);

  const download = async () => {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/export/ingested-data");
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `emi-healthfit-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-sm font-medium">Your ingested data</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Download all imported Apple Health and Hevy records as a portable JSON file.
      </p>
      {summary !== null && (
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Records</dt>
            <dd className="font-medium">{summary.totalRecords.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Apple Health range</dt>
            <dd className="font-medium">{formatRange(summary.healthRange)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Hevy range</dt>
            <dd className="font-medium">{formatRange(summary.hevyRange)}</dd>
          </div>
        </dl>
      )}
      <Button
        onClick={() => void download()}
        disabled={exporting}
        variant="outline"
        className="mt-3 w-full gap-2"
      >
        <DownloadIcon className="size-4" />
        {exporting ? "Preparing export…" : "Export Health + Hevy data"}
      </Button>
      {error !== null && <p className="mt-2 text-center text-xs text-destructive">{error}</p>}
    </div>
  );
};
