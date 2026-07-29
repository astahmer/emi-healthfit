import type { ReactNode } from "react";

export interface ComposerModelOption {
  id: string;
  label: string;
}

export interface ComposerControls {
  model: string;
  onModelChange: (model: string) => void;
  coachMode: boolean;
  onCoachModeChange: () => void;
  webSearch: boolean;
  onWebSearchChange: (value: boolean) => void;
  temporary: boolean;
  onTemporaryChange: (value: boolean) => void;
  onKeepTemporary: (messages: ReadonlyArray<unknown>) => Promise<void>;
  models: ReadonlyArray<ComposerModelOption>;
  canWebSearch: boolean;
}

export interface ThreadViewportProps {
  scrollId?: string;
  empty?: ReactNode;
  messages: ReactNode;
  composer: ReactNode;
  contextSummary?: ReactNode;
  scrollRef?: (node: HTMLDivElement | null) => void;
  className?: string;
}
