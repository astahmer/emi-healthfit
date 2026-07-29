"use client";

import { useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAppVersionLabel, readAppVersionInfo } from "./app-version";
import {
  createServiceWorkerUpdater,
  type ServiceWorkerUpdateResult,
  type ServiceWorkerUpdater,
} from "./service-worker-updates";

const statusMessage = (result: ServiceWorkerUpdateResult | null): string | null => {
  if (result === null) return null;
  if (result.status === "unsupported") {
    return "This browser does not support automatic app updates.";
  }
  if (result.status === "up-to-date") return "You are on the latest version.";
  if (result.status === "updating") return "Updating to the latest version…";
  return result.message ?? "Could not check for updates.";
};

export const AppAboutSettings = ({
  updater = createServiceWorkerUpdater(),
}: {
  updater?: ServiceWorkerUpdater;
}) => {
  const versionInfo = readAppVersionInfo();
  const versionLabel = formatAppVersionLabel(versionInfo);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ServiceWorkerUpdateResult | null>(null);

  const checkForUpdates = async () => {
    setChecking(true);
    setResult(null);
    try {
      setResult(await updater.checkForUpdate());
    } finally {
      setChecking(false);
    }
  };

  return (
    <section aria-label="App version" className="space-y-3 rounded-md border border-input p-3">
      <div>
        <h3 className="text-sm font-medium">App version</h3>
        <p className="text-muted-foreground mt-1 text-sm" data-testid="app-version-label">
          {versionLabel}
        </p>
        {versionInfo.releasedAt !== undefined && (
          <p className="text-muted-foreground mt-1 text-xs">
            Released {new Date(versionInfo.releasedAt).toLocaleString()} · JJ {versionInfo.commitId}
          </p>
        )}
        <p className="text-muted-foreground mt-1 text-xs">
          The app checks for updates automatically. Use the button below if a phone still shows an
          older build after a release.
        </p>
        <a href="/releases" className="mt-2 inline-block text-xs underline underline-offset-4">
          View release history
        </a>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        disabled={checking}
        onClick={() => void checkForUpdates()}
      >
        <RefreshCwIcon className={checking ? "size-4 animate-spin" : "size-4"} />
        Check for updates
      </Button>
      {statusMessage(result) !== null && (
        <p
          className={`text-center text-xs ${
            result?.status === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
          data-testid="app-update-status"
        >
          {statusMessage(result)}
        </p>
      )}
    </section>
  );
};
