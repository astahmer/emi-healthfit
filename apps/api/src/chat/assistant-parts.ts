export const buildAssistantParts = (messages: unknown[]): unknown[] => {
  const assistantParts: unknown[] = [];
  const toolCalls = new Map<string, { toolName: string; args: unknown }>();
  const toolResults = new Map<string, unknown>();

  const messageParts = (message: unknown): unknown[] => {
    if (typeof message !== "object" || message === null) return [];
    const content = (message as { content?: unknown }).content;
    if (Array.isArray(content)) return content;
    if (content !== undefined && content !== null) return [content];
    return [];
  };

  for (const message of messages) {
    const role =
      typeof message === "object" && message !== null
        ? (message as { role?: string }).role
        : undefined;
    for (const part of messageParts(message)) {
      if (typeof part !== "object" || part === null) continue;
      const type = (part as { type?: string }).type;
      const toolCallId = (part as { toolCallId?: string }).toolCallId;

      if (role === "assistant" && type === "tool-call" && toolCallId !== undefined) {
        toolCalls.set(toolCallId, {
          toolName: (part as { toolName?: string }).toolName ?? "",
          args: (part as { args?: unknown }).args,
        });
      } else if (role === "tool" && type === "tool-result" && toolCallId !== undefined) {
        toolResults.set(toolCallId, (part as { result?: unknown }).result);
      }
    }
  }

  for (const message of messages) {
    const role =
      typeof message === "object" && message !== null
        ? (message as { role?: string }).role
        : undefined;
    if (role !== "assistant") continue;
    for (const part of messageParts(message)) {
      if (typeof part !== "object" || part === null) continue;
      const type = (part as { type?: string }).type;
      const toolCallId = (part as { toolCallId?: string }).toolCallId;

      if (type === "text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text !== "") {
          assistantParts.push({ type: "text", text });
        }
      } else if (type === "tool-call" && toolCallId !== undefined) {
        const call = toolCalls.get(toolCallId);
        if (call !== undefined) {
          assistantParts.push({
            type: "tool-call",
            toolName: call.toolName,
            argsText: JSON.stringify(call.args),
            result: toolResults.get(toolCallId),
            status: { type: "complete" },
          });
        }
      }
    }
  }

  return assistantParts;
};
