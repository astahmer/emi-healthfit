"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runApi } from "./api-client";
import type { DiscordAccountLink, DiscordLinkCode } from "@emi/core-migration/contract";

export const DiscordLinkControls = () => {
  const [links, setLinks] = useState<ReadonlyArray<DiscordAccountLink>>([]);
  const [codes, setCodes] = useState<ReadonlyArray<DiscordLinkCode>>([]);
  const [latestCode, setLatestCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const data = await runApi((client) => client.discord.list(), { signal });
    setLinks(data.links);
    setCodes(data.codes);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((reason) => {
      if (!controller.signal.aborted)
        setStatus(reason instanceof Error ? reason.message : "Could not load Discord links");
    });
    return () => controller.abort();
  }, [refresh]);

  const createCode = async () => {
    setBusy("create");
    setStatus(null);
    setLatestCode(null);
    try {
      const created = await runApi((client) => client.discord.createCode());
      setLatestCode(created.code);
      setStatus(`Code expires at ${new Date(created.expires_at).toLocaleString()}.`);
      await refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not create link code");
    } finally {
      setBusy(null);
    }
  };

  const revokeCode = async (id: string) => {
    setBusy(id);
    setStatus(null);
    try {
      await runApi((client) => client.discord.revokeCode({ params: { id } }));
      setLatestCode(null);
      await refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not revoke code");
    } finally {
      setBusy(null);
    }
  };

  const unlink = async (discordUserId: string) => {
    if (!window.confirm("Unlink this Discord account from Emi HealthFit?")) return;
    setBusy(discordUserId);
    setStatus(null);
    try {
      await runApi((client) => client.discord.unlink({ params: { discordUserId } }));
      await refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not unlink Discord account");
    } finally {
      setBusy(null);
    }
  };

  const activeCodes = codes.filter(
    (code) => code.consumed_at === null && code.expires_at > new Date().toISOString(),
  );

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Link2Icon className="size-4" />
        <h3 className="text-sm font-medium">Discord bot</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Generate a one-time code, then run{" "}
        <code className="rounded bg-muted px-1">/healthfit link code:&lt;code&gt;</code> in Discord.
        Codes expire in 10 minutes and are single-use.
      </p>

      <Button
        onClick={() => void createCode()}
        disabled={busy !== null}
        variant="outline"
        className="mt-3 w-full"
      >
        {busy === "create" ? "Creating…" : "Generate link code"}
      </Button>

      {latestCode !== null && (
        <p className="mt-3 rounded-md border border-dashed bg-muted/40 p-3 text-center font-mono text-lg tracking-widest">
          {latestCode}
        </p>
      )}

      {activeCodes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {activeCodes.map((code) => (
            <li key={code.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                Active until {new Date(code.expires_at).toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void revokeCode(code.id)}
              >
                <Trash2Icon className="size-3.5" />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <ul className="mt-3 space-y-2 border-t pt-3">
          {links.map((link) => (
            <li
              key={link.discord_user_id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span>
                Linked Discord id{" "}
                <code className="rounded bg-muted px-1">{link.discord_user_id}</code>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void unlink(link.discord_user_id)}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}

      {status !== null && (
        <p className="text-muted-foreground mt-2 text-center text-xs">{status}</p>
      )}
    </div>
  );
};
