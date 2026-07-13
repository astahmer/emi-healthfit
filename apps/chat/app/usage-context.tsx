"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { MessageUsage } from "./sessions";

interface UsageContextValue {
  usageByMessageId: Map<string, MessageUsage>;
  totalUsage: MessageUsage;
}

const UsageContext = createContext<UsageContextValue>({
  usageByMessageId: new Map(),
  totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
});

interface UsageProviderProps {
  usages: Array<{ messageId: string; usage: MessageUsage }>;
  children: ReactNode;
}

const sumTokens = (values: number[]) =>
  values.reduce((sum, value) => (value !== null && !Number.isNaN(value) ? sum + value : sum), 0);

export const UsageProvider = ({ usages, children }: UsageProviderProps) => {
  const value = useMemo(() => {
    const usageByMessageId = new Map<string, MessageUsage>();
    for (const item of usages) {
      usageByMessageId.set(item.messageId, item.usage);
    }

    const totalUsage: MessageUsage = {
      promptTokens: sumTokens(usages.map((item) => item.usage.promptTokens)),
      completionTokens: sumTokens(usages.map((item) => item.usage.completionTokens)),
      totalTokens: sumTokens(usages.map((item) => item.usage.totalTokens)),
    };

    return { usageByMessageId, totalUsage };
  }, [usages]);

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
};

export const useUsage = (): UsageContextValue => useContext(UsageContext);
