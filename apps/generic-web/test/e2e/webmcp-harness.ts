import type { Page } from "@playwright/test";

export const installWebMcpHarness = (page: Page): Promise<void> =>
  page
    .addInitScript(() => {
      const tools = new Map<string, { readonly execute: (input: unknown) => Promise<unknown> }>();
      const modelContext = {
        registerTool: (
          tool: { readonly name: string; readonly execute: (input: unknown) => Promise<unknown> },
          options?: { readonly signal?: AbortSignal },
        ) => {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener("abort", () => tools.delete(tool.name), { once: true });
          return Promise.resolve();
        },
        getToolNames: () => [...tools.keys()].toSorted(),
        executeTool: (name: string, input: unknown) => {
          const tool = tools.get(name);
          if (tool === undefined) throw new Error(`Missing WebMCP tool: ${name}`);
          return tool.execute(input);
        },
      };

      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: modelContext,
      });
    })
    .then(() => undefined);

export const readWebMcpToolNames = (page: Page): Promise<ReadonlyArray<string>> =>
  page.evaluate(() => {
    const modelContext = Reflect.get(document, "modelContext");
    if (typeof modelContext !== "object" || modelContext === null) return [];
    const getToolNames = Reflect.get(modelContext, "getToolNames");
    if (typeof getToolNames !== "function") return [];
    const names = getToolNames.call(modelContext);
    return Array.isArray(names)
      ? names.filter((name): name is string => typeof name === "string")
      : [];
  });

export const executeWebMcpTool = (
  page: Page,
  name: string,
  input: Record<string, string>,
): Promise<unknown> =>
  page.evaluate(
    ({ name: toolName, input: toolInput }) => {
      const modelContext = Reflect.get(document, "modelContext");
      if (typeof modelContext !== "object" || modelContext === null)
        throw new Error("WebMCP model context is unavailable");
      const executeTool = Reflect.get(modelContext, "executeTool");
      if (typeof executeTool !== "function") throw new Error("WebMCP harness is unavailable");
      return executeTool.call(modelContext, toolName, toolInput);
    },
    { name, input },
  );
