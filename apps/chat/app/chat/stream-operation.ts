export const shouldAcceptStreamUpdate = ({
  activeOperation,
  eventOperation,
}: {
  activeOperation: number;
  eventOperation: number;
}): boolean => activeOperation === eventOperation;

export const shouldApplyHistoryWhileStreaming = ({
  contextSessionId,
  eventSessionId,
}: {
  contextSessionId: string | undefined;
  eventSessionId: string | undefined;
}): boolean => contextSessionId !== eventSessionId;
