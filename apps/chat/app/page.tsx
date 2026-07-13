"use client";

import { useState } from "react";
import { Thread } from "@/components/assistant-ui/thread";
import { UploadPanel } from "./upload";
import { SummaryPanel } from "./summary";
import { SettingsPanel } from "./settings";
import { Providers } from "./providers";

type Tab = "chat" | "upload" | "summary" | "settings";

export default function Home() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <Providers>
      <main className="flex h-dvh flex-col bg-background text-foreground">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Emi HealthFit</h1>
            <p className="text-muted-foreground text-xs">
              Personal gym assistant
            </p>
          </div>
          <nav className="flex gap-1">
            <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
              Chat
            </TabButton>
            <TabButton
              active={tab === "upload"}
              onClick={() => setTab("upload")}
            >
              Upload
            </TabButton>
            <TabButton
              active={tab === "summary"}
              onClick={() => setTab("summary")}
            >
              Summary
            </TabButton>
            <TabButton
              active={tab === "settings"}
              onClick={() => setTab("settings")}
            >
              Settings
            </TabButton>
          </nav>
        </header>

        <div className="flex-1 overflow-hidden">
          {tab === "chat" && <Thread />}
          {tab === "upload" && <UploadPanel />}
          {tab === "summary" && <SummaryPanel />}
          {tab === "settings" && <SettingsPanel />}
        </div>
      </main>
    </Providers>
  );
}

const TabButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`}
  >
    {children}
  </button>
);
