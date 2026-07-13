"use client";

import { Button } from "@/components/ui/button";
import { chatModels, defaultModel } from "./models";
import { useSettings } from "./settings-store";

export function SettingsPanel() {
  const { settings, update } = useSettings();

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-xl font-semibold">Settings</h2>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Provider</label>
          <select
            value={settings.provider}
            onChange={(e) => update({ provider: e.target.value as "openai" })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="openai">OpenAI</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Mode</label>
          <select
            value={settings.mode}
            onChange={(e) => update({ mode: e.target.value as "proxy" | "direct" })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="proxy">Proxy via CF Worker (tools enabled)</option>
            <option value="direct">Direct to provider</option>
          </select>
          <p className="text-muted-foreground mt-1 text-xs">
            Proxy mode routes chat through the CF Worker, which can call tools. Direct mode calls
            the provider API from the browser.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Base URL</label>
          <input
            type="text"
            value={settings.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Leave empty for default OpenAI URL. Use a GPT-compatible endpoint (e.g. your CF worker)
            by entering its base URL.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">API Key</label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Stored in browser localStorage. In proxy mode it is sent to the CF Worker, which uses it
            to call the provider.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Model</label>
          <select
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
          <label className="text-sm font-medium">System prompt</label>
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
            rows={4}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
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
              Injects the fitness coach pre-prompt before the user message. Only applies in proxy
              mode.
            </p>
          </div>
        </div>

        <Button
          onClick={() =>
            update({
              provider: "openai",
              mode: "proxy",
              baseUrl: "",
              apiKey: "",
              model: defaultModel.id,
              systemPrompt:
                "You are Emi, a helpful fitness assistant. You have access to the user's health and workout data via tools.",
              coachMode: false,
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
