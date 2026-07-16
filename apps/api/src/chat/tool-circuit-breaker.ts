const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
};

export const createToolCircuitBreaker = () => {
  const failedCalls = new Set<string>();
  const keyOf = ({ name, args }: { name: string; args: Record<string, unknown> }): string =>
    JSON.stringify([name, stableValue(args)]);
  return {
    isBlocked: ({ name, args }: { name: string; args: Record<string, unknown> }): boolean =>
      failedCalls.has(keyOf({ name, args })),
    recordFailure: ({ name, args }: { name: string; args: Record<string, unknown> }): void => {
      failedCalls.add(keyOf({ name, args }));
    },
  };
};
