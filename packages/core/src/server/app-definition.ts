import type { JSONSchema7 } from "json-schema";

export interface AppIdentity {
  name: string;
  description?: string;
}

export interface PromptContributor {
  id: string;
  order?: number;
  text: string;
}

export interface AppToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7;
}

export interface AppDefinition {
  identity: AppIdentity;
  promptContributors?: ReadonlyArray<PromptContributor>;
  tools?: ReadonlyArray<AppToolDefinition>;
}

const byOrderThenIndex = (
  a: { contributor: PromptContributor; index: number },
  b: { contributor: PromptContributor; index: number },
): number => {
  const orderA = a.contributor.order ?? Number.POSITIVE_INFINITY;
  const orderB = b.contributor.order ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) return orderA - orderB;
  return a.index - b.index;
};

const mergePromptContributors = (
  definitions: ReadonlyArray<AppDefinition>,
): PromptContributor[] => {
  const contributors: Array<{ contributor: PromptContributor; index: number }> = [];
  let index = 0;
  for (const definition of definitions) {
    for (const contributor of definition.promptContributors ?? []) {
      contributors.push({ contributor, index });
      index += 1;
    }
  }
  return contributors.toSorted(byOrderThenIndex).map(({ contributor }) => contributor);
};

const mergeTools = (definitions: ReadonlyArray<AppDefinition>): AppToolDefinition[] => {
  const toolsByName = new Map<string, AppToolDefinition>();
  const order: string[] = [];
  for (const definition of definitions) {
    for (const tool of definition.tools ?? []) {
      if (!toolsByName.has(tool.name)) order.push(tool.name);
      toolsByName.set(tool.name, tool);
    }
  }
  return order.map((name) => {
    const tool = toolsByName.get(name);
    if (tool === undefined) throw new Error(`Unreachable: missing merged tool "${name}"`);
    return tool;
  });
};

/**
 * Merges app definitions left to right: later definitions override earlier
 * identity fields and tool bodies for a shared name, while keeping that
 * tool's earliest position. Prompt contributors are concatenated in
 * argument order, then stably sorted by `order` (undefined sorts last).
 */
const mergeAppDefinitions = (...definitions: ReadonlyArray<AppDefinition>): AppDefinition => {
  const identity: AppIdentity = { name: "" };
  for (const definition of definitions) Object.assign(identity, definition.identity);
  return {
    identity,
    promptContributors: mergePromptContributors(definitions),
    tools: mergeTools(definitions),
  };
};

const composeSystemPrompt = (
  promptContributors: ReadonlyArray<PromptContributor> | undefined,
): string => (promptContributors ?? []).map((contributor) => contributor.text).join("\n\n");

const coreAppDefinition: AppDefinition = {
  identity: {
    name: "Core Chat",
    description: "Reusable chat core: conversations, memory, notes, and auth.",
  },
  promptContributors: [],
  tools: [],
};

export class AppDefinitions {
  static readonly core = coreAppDefinition;
  static readonly composeSystemPrompt = composeSystemPrompt;
  static readonly merge = mergeAppDefinitions;
}
