"use client";

import { useEffect, useState } from "react";
import { Link2Icon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runApi } from "./api-client";

type HevyStatus = {
  connected: boolean;
  status: string;
  providerUserId: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastDataChangeAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  fresh: boolean;
};

const formatTimestamp = (value: string | null) => {
  if (value === null) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const HevyIntegration = () => {
  const [status, setStatus] = useState<HevyStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshStatus = async (signal?: AbortSignal) => {
    const next = await runApi((client) => client.hevy.status(), { signal });
    setStatus(next);
  };

  useEffect(() => {
    const controller = new AbortController();
    void refreshStatus(controller.signal).catch((reason) => {
      if (!controller.signal.aborted) {
        setMessage(reason instanceof Error ? reason.message : "Could not load Hevy status");
      }
    });
    return () => controller.abort();
  }, []);

  const connect = async () => {
    setBusy("connect");
    setMessage(null);
    try {
      const result = await runApi((client) => client.hevy.connect({ payload: { apiKey } }));
      setStatus(result.status);
      setApiKey("");
      setMessage(
        `Connected${result.providerUserName ? ` as ${result.providerUserName}` : ""}. Imported ${result.sync.imported} workout(s).`,
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not connect Hevy");
    } finally {
      setBusy(null);
    }
  };

  const syncNow = async () => {
    setBusy("sync");
    setMessage(null);
    try {
      const sync = await runApi((client) => client.hevy.sync());
      await refreshStatus();
      setMessage(
        sync.mode === "skipped_fresh"
          ? "Already up to date."
          : `Sync ${sync.mode}: updated ${sync.updated}, deleted ${sync.deleted}, imported ${sync.imported}.`,
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not sync Hevy");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Hevy? Local workout history will be kept.")) return;
    setBusy("disconnect");
    setMessage(null);
    try {
      await runApi((client) => client.hevy.disconnect());
      await refreshStatus();
      setMessage("Hevy disconnected. Local history kept.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not disconnect Hevy");
    } finally {
      setBusy(null);
    }
  };

  const removeData = async () => {
    if (
      !window.confirm(
        "Remove all cached Hevy data, connection, and raw CSV uploads? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy("remove");
    setMessage(null);
    try {
      const result = await runApi((client) => client.hevy.removeData());
      await refreshStatus();
      setMessage(`Hevy data removed (${result.deletedRawUploads} raw upload(s)).`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not remove Hevy data");
    } finally {
      setBusy(null);
    }
  };

  const connected = status?.connected === true;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Link2Icon className="size-4" />
        <h3 className="text-sm font-medium">Hevy</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Connect a Hevy Pro API key. It is encrypted and stays on the server. Sync runs on connect,
        Sync now, and when workout data is stale (no background cron on Workers Free — see API
        SCHEDULING.md for Paid upgrade).
      </p>

      {status === null ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading status…</p>
      ) : connected ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            {status.fresh ? "Up to date" : "May be stale"}
            {status.providerUserId ? ` · user ${status.providerUserId}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Last checked {formatTimestamp(status.lastCheckedAt)} · Last data change{" "}
            {formatTimestamp(status.lastDataChangeAt)}
          </p>
          {status.lastErrorCode !== null && (
            <p className="text-xs text-destructive">
              Last error: {status.lastErrorCode} at {formatTimestamp(status.lastErrorAt)}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              onClick={() => void syncNow()}
              disabled={busy !== null}
              variant="outline"
              className="gap-2"
            >
              <RefreshCwIcon className={busy === "sync" ? "size-4 animate-spin" : "size-4"} />
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </Button>
            <Button
              onClick={() => void disconnect()}
              disabled={busy !== null}
              variant="outline"
              className="gap-2"
            >
              <UnplugIcon className="size-4" />
              Disconnect
            </Button>
            <Button
              onClick={() => void removeData()}
              disabled={busy !== null}
              variant="destructive"
            >
              Remove cached data…
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Hevy API key"
            autoComplete="off"
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button
            onClick={() => void connect()}
            disabled={busy !== null || apiKey.trim() === ""}
            className="w-full"
          >
            {busy === "connect" ? "Connecting…" : "Connect and sync"}
          </Button>
        </div>
      )}

      {message !== null && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
    </div>
  );
};
