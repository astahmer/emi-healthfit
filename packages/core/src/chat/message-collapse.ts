export const collapseCompactedMessages = <Message extends { role: string; createdAt: string }>(
  messages: ReadonlyArray<Message>,
): Message[] => {
  const marker = messages
    .filter((message) => message.role === "summary")
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  if (marker === undefined) return [...messages];
  return [
    marker,
    ...messages
      .filter(
        (message) =>
          message !== marker && message.role !== "summary" && message.createdAt > marker.createdAt,
      )
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt)),
  ];
};
