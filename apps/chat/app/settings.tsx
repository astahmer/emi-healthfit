"use client";

import { useMachine } from "@xstate/react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatModels, defaultModel } from "./models";
import { DEFAULT_TOKEN_BUDGET, useSettings } from "./settings-store";
import { settingsSyncMachine } from "./settings-sync-machine";
import { AppAboutSettings } from "./app-about-settings";
import { DataImport } from "./data-import";
import { DataExport } from "./data-export";
import { HevyIntegration } from "./hevy-integration";
import { PrivacyControls } from "./privacy-controls";
import { DiscordLinkControls } from "./discord-link-controls";

export function SettingsPanel() {
  const { settings, update } = useSettings();
  const [syncState, sendSync] = useMachine(settingsSyncMachine);

  const syncing = syncState.matches("syncing");
  const syncStatus = syncState.context.status;

  return (
    <div className="mx-auto max-w-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
      <h2 className="mb-4 text-xl font-semibold">Settings</h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="provider" className="text-sm font-medium">
            Provider
          </label>
          <select
            id="provider"
            value={settings.provider}
            onChange={(e) => update({ provider: e.target.value as "openai" })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="openai">OpenAI</option>
          </select>
        </div>

        <div>
          <label htmlFor="base-url" className="text-sm font-medium">
            Base URL
          </label>
          <input
            id="base-url"
            type="text"
            value={settings.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Leave empty for OpenAI. Enter a GPT-compatible endpoint only when you need one.
          </p>
        </div>

        <div>
          <label htmlFor="api-key" className="text-sm font-medium">
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Stored in browser localStorage and used only for requests you start.
          </p>
        </div>

        <div>
          <label htmlFor="model" className="text-sm font-medium">
            Model
          </label>
          <select
            id="model"
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {chatModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} — {model.description}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="system-prompt" className="text-sm font-medium">
            System prompt
          </label>
          <textarea
            id="system-prompt"
            value={settings.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
            rows={4}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="default-token-budget" className="text-sm font-medium">
            Default token budget
          </label>
          <input
            id="default-token-budget"
            type="number"
            min={0}
            step={1_000}
            value={settings.tokenBudget}
            onChange={(e) => update({ tokenBudget: Math.max(0, Number(e.target.value) || 0) })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Auto-compact trigger for new conversations. Per-conversation budgets override it; 0
            disables the budget.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="coach-mode"
            type="checkbox"
            checked={settings.coachMode}
            onChange={(e) => update({ coachMode: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <div>
            <label htmlFor="coach-mode" className="text-sm font-medium">
              Coach mode
            </label>
            <p className="text-muted-foreground text-xs">
              Adds Emi's fitness-coach instructions to each chat request.
            </p>
          </div>
        </div>

        <Button
          onClick={() => sendSync({ type: "sync" })}
          disabled={syncing}
          variant="outline"
          className="w-full gap-2"
        >
          <RefreshCwIcon className={syncing ? "size-4 animate-spin" : "size-4"} />
          Sync sessions now
        </Button>
        {syncStatus !== null && (
          <p
            className={`text-center text-xs ${
              syncStatus === "Sessions synced" ? "text-muted-foreground" : "text-destructive"
            }`}
          >
            {syncStatus}
          </p>
        )}

        <HevyIntegration />

        <DataExport />

        <DataImport />

        <PrivacyControls />

        <DiscordLinkControls />

        <AppAboutSettings />

        <Button
          onClick={() =>
            update({
              provider: "openai",
              baseUrl: "",
              apiKey: "",
              model: defaultModel.id,
              systemPrompt:
                "You are Emi, a helpful fitness assistant. You have access to the user's health and workout data via tools.",
              coachMode: true,
              tokenBudget: DEFAULT_TOKEN_BUDGET,
            })
          }
          variant="outline"
          className="w-full"
        >
          Reset defaults
        </Button>
      </div>
    </div>
  );
}
