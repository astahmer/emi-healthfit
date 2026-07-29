export const runtimeSelectionMatches = ({
  runtimeSessionId,
  selectedSessionId,
  temporary,
}: {
  runtimeSessionId: string | undefined;
  selectedSessionId: string | undefined;
  temporary: boolean;
}): boolean => {
  if (runtimeSessionId === selectedSessionId) return true;
  return temporary && selectedSessionId === undefined && runtimeSessionId !== undefined;
};

export const canQueueFollowUp = ({
  isStreaming,
  runtimeSessionId,
  selectedSessionId,
  temporary,
}: {
  isStreaming: boolean;
  runtimeSessionId: string | undefined;
  selectedSessionId: string | undefined;
  temporary: boolean;
}): boolean =>
  isStreaming && runtimeSelectionMatches({ runtimeSessionId, selectedSessionId, temporary });
