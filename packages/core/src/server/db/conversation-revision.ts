interface CausalMessage {
  id: string;
  parent_id: string | null;
}

export const getRevisionDeletionIds = ({
  conversationRows,
  scopedRows,
  messageId,
  includeDescendants,
}: {
  conversationRows: CausalMessage[];
  scopedRows: CausalMessage[];
  messageId: string;
  includeDescendants: boolean;
}): string[] => {
  const messageIndex = scopedRows.findIndex((row) => row.id === messageId);
  if (messageIndex < 0) return [];

  const deletedMessageIds = new Set(scopedRows.slice(messageIndex + 1).map((row) => row.id));
  if (!includeDescendants) return Array.from(deletedMessageIds);

  const discoverDescendants = () => {
    const previousSize = deletedMessageIds.size;
    for (const row of conversationRows) {
      if (
        row.id !== messageId &&
        row.parent_id !== null &&
        (row.parent_id === messageId || deletedMessageIds.has(row.parent_id)) &&
        !deletedMessageIds.has(row.id)
      ) {
        deletedMessageIds.add(row.id);
      }
    }
    if (deletedMessageIds.size > previousSize) discoverDescendants();
  };
  discoverDescendants();
  return Array.from(deletedMessageIds);
};
