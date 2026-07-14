"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { MessageUsage, MessageWithUsage } from "./sessions";

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
