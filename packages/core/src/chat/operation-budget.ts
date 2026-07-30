export type ChatOperationCategory = "persistence" | "telemetry" | "tool";

export interface ChatOperationBudgetSnapshot {
  maximumOperations: number;
  reservedOperations: number;
  usedOperations: number;
  remainingOperations: number;
  maximumToolCalls: number;
  toolCalls: number;
  skippedPersistenceOperations: number;
  skippedTelemetryOperations: number;
  skippedToolCalls: number;
}

export const createChatOperationBudget = ({
  maximumOperations = 40,
  reservedOperations = 4,
  maximumToolCalls = 6,
}: {
  maximumOperations?: number;
  reservedOperations?: number;
  maximumToolCalls?: number;
} = {}) => {
  let usedOperations = 0;
  let toolCalls = 0;
  let skippedPersistenceOperations = 0;
  let skippedTelemetryOperations = 0;
  let skippedToolCalls = 0;

  const snapshot = (): ChatOperationBudgetSnapshot => ({
    maximumOperations,
    reservedOperations,
    usedOperations,
    remainingOperations: Math.max(0, maximumOperations - usedOperations),
    maximumToolCalls,
    toolCalls,
    skippedPersistenceOperations,
    skippedTelemetryOperations,
    skippedToolCalls,
  });

  const skip = (category: ChatOperationCategory) => {
    if (category === "persistence") skippedPersistenceOperations += 1;
    if (category === "telemetry") skippedTelemetryOperations += 1;
    if (category === "tool") skippedToolCalls += 1;
  };

  const tryReserve = ({
    category,
    operations = 1,
    essential = false,
  }: {
    category: ChatOperationCategory;
    operations?: number;
    essential?: boolean;
  }): boolean => {
    const limit = essential ? maximumOperations : maximumOperations - reservedOperations;
    if (usedOperations + operations > limit) {
      skip(category);
      return false;
    }
    usedOperations += operations;
    return true;
  };

  const tryStartToolCall = (): boolean => {
    if (toolCalls >= maximumToolCalls) {
      skip("tool");
      return false;
    }
    if (!tryReserve({ category: "tool" })) return false;
    toolCalls += 1;
    return true;
  };

  return { snapshot, tryReserve, tryStartToolCall };
};
