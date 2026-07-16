const normalizeToolOutput = (output: unknown): unknown => {
  if (typeof output !== "object" || output === null || !("type" in output)) return output;
  if ((output.type === "json" || output.type === "text") && "value" in output) {
    return output.value;
  }
  return output;
};

const isErrorOutput = (output: unknown): boolean =>
  typeof output === "object" &&
  output !== null &&
  (("type" in output && output.type === "error-text") ||
    ("error" in output && typeof output.error === "string"));

const messageParts = (message: unknown): unknown[] => {
  if (typeof message !== "object" || message === null) return [];
  const content = (message as { content?: unknown }).content;
  if (Array.isArray(content)) return content;
  if (content !== undefined && content !== null) return [content];
  return [];
};

export const buildAssistantParts = (messages: unknown[]): unknown[] => {
  const assistantParts: unknown[] = [];
  const toolCalls = new Map<string, { toolName: string; input: unknown }>();
  const toolResults = new Map<string, { output: unknown; outcome: "success" | "error" }>();
  const emittedToolCalls = new Set<string>();

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
          input: (part as { input?: unknown }).input,
        });
      } else if (role === "tool" && type === "tool-result" && toolCallId !== undefined) {
        const rawOutput = (part as { output?: unknown }).output;
        toolResults.set(toolCallId, {
          output: normalizeToolOutput(rawOutput),
          outcome: isErrorOutput(rawOutput) ? "error" : "success",
        });
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
        if (emittedToolCalls.has(toolCallId)) continue;
        const call = toolCalls.get(toolCallId);
        if (call !== undefined) {
          const result = toolResults.get(toolCallId);
          emittedToolCalls.add(toolCallId);
          assistantParts.push({
            type: "dynamic-tool",
            toolName: call.toolName,
            toolCallId,
            input: call.input,
            output: result?.output,
            outcome: result?.outcome ?? "error",
            state: result?.outcome === "success" ? "output-available" : "output-error",
          });
        }
      }
    }
  }

  return assistantParts;
};
