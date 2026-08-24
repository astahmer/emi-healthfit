"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CoinsIcon } from "lucide-react";
import { chatModels } from "./models";
import type { MessageUsage, MessageWithUsage } from "./sessions";
import { useSettings } from "./settings-store";

interface MessageMeta {
  usage?: MessageUsage;
  model?: string;
  createdAt?: string;
}

interface UsageContextValue {
  usageByMessageId: Map<string, MessageUsage>;
  metaByMessageId: Map<string, MessageMeta>;
  totalUsage: MessageUsage;
}

const UsageContext = createContext<UsageContextValue>({
  usageByMessageId: new Map(),
  metaByMessageId: new Map(),
  totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
});

interface UsageProviderProps {
  messages: MessageWithUsage[];
  children: ReactNode;
}

const sumTokens = (values: number[]) =>
  values.reduce((sum, value) => (value !== null && !Number.isNaN(value) ? sum + value : sum), 0);

export const UsageProvider = ({ messages, children }: UsageProviderProps) => {
  const value = useMemo(() => {
    const usageByMessageId = new Map<string, MessageUsage>();
    const metaByMessageId = new Map<string, MessageMeta>();
    const usages: Array<{ messageId: string; usage: MessageUsage }> = [];

    for (const message of messages) {
      const meta: MessageMeta = {};
      if (message.usage !== undefined) {
        usageByMessageId.set(message.id, message.usage);
        usages.push({ messageId: message.id, usage: message.usage });
        meta.usage = message.usage;
      }
      if (message.model !== undefined) meta.model = message.model;
      if (message.createdAt !== undefined) meta.createdAt = message.createdAt;
      if (Object.keys(meta).length > 0) {
        metaByMessageId.set(message.id, meta);
      }
    }

    const totalUsage: MessageUsage = {
      promptTokens: sumTokens(usages.map((item) => item.usage.promptTokens ?? 0)),
      completionTokens: sumTokens(usages.map((item) => item.usage.completionTokens ?? 0)),
      totalTokens: sumTokens(usages.map((item) => item.usage.totalTokens ?? 0)),
    };

    return { usageByMessageId, metaByMessageId, totalUsage };
  }, [messages]);

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
};

export const useUsage = (): UsageContextValue => useContext(UsageContext);

const estimateMessageCost = (metadata: MessageMeta): number => {
  const model = chatModels.find((candidate) => candidate.id === metadata.model);
  if (model === undefined || metadata.usage === undefined) return 0;
  return (
    ((metadata.usage.promptTokens ?? 0) * model.pricing.inputUsdPerMillion +
      (metadata.usage.completionTokens ?? 0) * model.pricing.outputUsdPerMillion) /
    1_000_000
  );
};

const formatTokens = (tokens: number): string =>
  new Intl.NumberFormat("en", { notation: tokens >= 10_000 ? "compact" : "standard" }).format(
    tokens,
  );

const readStoredBudget = (storageKey: string): number | null => {
  const raw = window.localStorage.getItem(storageKey);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export const tokenBudgetStorageKey = (conversationId: string): string =>
  `emi-healthfit:token-budget:${conversationId}`;

export const effectiveTokenBudget = ({
  conversationId,
  defaultBudget,
}: {
  conversationId: string | undefined;
  defaultBudget: number;
}): number =>
  conversationId === undefined
    ? defaultBudget
    : (readStoredBudget(tokenBudgetStorageKey(conversationId)) ?? defaultBudget);

export const ConversationUsage = ({ conversationId }: { conversationId: string }) => {
  const usage = useUsage();
  const { settings } = useSettings();
  const storageKey = tokenBudgetStorageKey(conversationId);
  const budgetFeatureEnabled = settings.tokenBudgetEnabled === true;
  if (!budgetFeatureEnabled) return null;
  const [budget, setBudget] = useState(settings.tokenBudget);

  useEffect(() => {
    setBudget(readStoredBudget(storageKey) ?? settings.tokenBudget);
  }, [storageKey, settings.tokenBudget]);

  const history = Array.from(usage.metaByMessageId.entries())
    .filter((entry) => entry[1].usage !== undefined)
    .toReversed();
  const estimatedCost = history.reduce((total, entry) => total + estimateMessageCost(entry[1]), 0);
  const totalTokens = usage.totalUsage.totalTokens ?? 0;
  const overBudget = budget > 0 && totalTokens > budget;
  const percentUsed = budget > 0 ? Math.round((totalTokens / budget) * 100) : null;

  return (
    <details className="group relative">
      <summary
        className="list-none"
        role="button"
        tabIndex={0}
        aria-label="Token usage"
      >
        <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          <CoinsIcon className="size-3.5" /> Token usage
        </span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-80 space-y-4 rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl">
        <div>
          <p className="text-sm font-medium">Conversation usage</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatTokens(usage.totalUsage.promptTokens ?? 0)} input ·{" "}
            {formatTokens(usage.totalUsage.completionTokens ?? 0)} output · ~$
            {estimatedCost.toFixed(4)}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium">
            Token budget
            <input
              type="number"
              min={0}
              step={1_000}
              value={budget}
              onChange={(event) => {
                const nextBudget = Math.max(0, Number(event.target.value) || 0);
                setBudget(nextBudget);
                window.localStorage.setItem(storageKey, String(nextBudget));
              }}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
            />
          </label>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            0 disables the budget for this conversation.
          </span>
        </div>
        {budget > 0 ? (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span className={overBudget ? "font-medium text-destructive" : undefined}>
                {percentUsed}% used{overBudget ? " · over budget" : ""}
              </span>
              <span>{formatTokens(budget)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={overBudget ? "h-full bg-destructive" : "h-full bg-primary"}
                style={{ width: `${Math.min(100, percentUsed ?? 0)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No budget set for this conversation.</p>
        )}
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Usage appears after a completed response.
            </p>
          ) : (
            history.map(([messageId, metadata]) => (
              <div key={messageId} className="flex justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">
                  {metadata.model ?? "Unknown model"}
                </span>
                <span>
                  {formatTokens(metadata.usage?.totalTokens ?? 0)} · $
                  {estimateMessageCost(metadata).toFixed(4)}
                </span>
              </div>
            ))
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Estimates use standard token prices and exclude cached-token and tool-call discounts or
          fees.
        </p>
      </div>
    </details>
  );
};
