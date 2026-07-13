"use client";

import { Suspense } from "react";
import { Thread } from "@/components/assistant-ui/thread";
import { chatModels } from "../models";
import { ChatProviders } from "../providers";
import { useSettings } from "../settings-store";
import { useSessionFlag, useSessionParam } from "./use-session-params";

function ChatPageInner() {
  const settings = useSettings((state) => state.settings);
  const [model, setModel] = useSessionParam("model", settings.model);
  const [coachMode, setCoachMode] = useSessionFlag("coach", settings.coachMode);
  const [webSearch, setWebSearch] = useSessionFlag("web", false);

  const selectedModel = chatModels.find((m) => m.id === model);
  const canWebSearch = selectedModel?.supportsWebSearch ?? false;

  return (
    <ChatProviders sessionConfig={{ model, coachMode, webSearch }}>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <label htmlFor="session-model" className="text-sm font-medium">
              Model
            </label>
            <select
              id="session-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              {chatModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={coachMode}
              onChange={(e) => setCoachMode(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Coach mode
          </label>

          <label
            className={`flex items-center gap-2 text-sm ${!canWebSearch ? "text-muted-foreground" : ""}`}
            title={
              canWebSearch
                ? "Search the web for real-time info"
                : "Switch to a responses-capable model (GPT-5 / GPT-5.2) to enable web search"
            }
          >
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => setWebSearch(e.target.checked)}
              disabled={!canWebSearch}
              className="h-4 w-4 rounded border-input"
            />
            Web search
          </label>
        </div>

        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>
      </div>
    </ChatProviders>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
