import type { Tool } from "assistant-stream";
import type { JSONSchema7 } from "json-schema";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7;
}

export interface ToolListResponse {
  tools: ToolDefinition[];
}

const apiBase = () =>
  typeof window === "undefined" ? "" : window.location.origin;

export const fetchTools = async (): Promise<ToolDefinition[]> => {
  const res = await fetch(`${apiBase()}/api/tools`);
  if (!res.ok) throw new Error(`Failed to load tools: ${res.status}`);
  const data = (await res.json()) as ToolListResponse;
  return data.tools;
};

const executeTool = async (
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> => {
  const res = await fetch(`${apiBase()}/api/tools/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(error.error || `Tool ${name} failed: ${res.status}`);
  }
  return res.json();
};

export const buildFrontendTools = (
  definitions: ToolDefinition[],
): Record<string, Tool<Record<string, unknown>, unknown>> => {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.name,
      {
        type: "frontend" as const,
        description: definition.description,
        parameters: definition.parameters,
        execute: async (args: Record<string, unknown>) => {
          const result = await executeTool(definition.name, args);
          return JSON.stringify(result);
        },
      },
    ]),
  );
};
