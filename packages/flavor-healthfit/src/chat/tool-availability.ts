const disabledToolNames = new Set([
  "get_recovery",
  "get_recovery_timeline",
  "get_sleep_trend",
  "get_next_workout",
]);

export const isConversationToolEnabled = (name: string): boolean => !disabledToolNames.has(name);
