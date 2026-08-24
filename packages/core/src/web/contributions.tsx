import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";
import type { ComponentRendererContribution } from "./dynamic-components.tsx";

export interface NavContribution {
  id: string;
  label: string;
  href: string;
  order?: number;
  icon?: ComponentType<{ className?: string }>;
  description?: string;
  /** Logical grouping; a divider renders between consecutive different groups. */
  section?: "product" | "data" | "system";
}

export interface PageContribution {
  id: string;
  path: string;
  component: ComponentType;
}

export interface ToolRendererContribution {
  toolName: string;
  component: ComponentType<{ result: unknown; className?: string }>;
}

export interface CoreWebContributions {
  nav?: NavContribution[];
  pages?: PageContribution[];
  toolRenderers?: ToolRendererContribution[];
  componentRenderers?: ComponentRendererContribution[];
}

export interface ResolvedCoreWebContributions {
  nav: NavContribution[];
  pages: PageContribution[];
  toolRenderers: ToolRendererContribution[];
  toolRendererByName: ReadonlyMap<string, ToolRendererContribution["component"]>;
  componentRenderers: ComponentRendererContribution[];
  componentRendererByName: ReadonlyMap<string, ComponentRendererContribution["component"]>;
}

const byOrder = (a: NavContribution, b: NavContribution): number => {
  const orderA = a.order ?? Number.POSITIVE_INFINITY;
  const orderB = b.order ?? Number.POSITIVE_INFINITY;
  return orderA - orderB;
};

export const mergeNavContributions = (nav?: NavContribution[]): NavContribution[] =>
  (nav ?? []).toSorted(byOrder);

export const resolveToolRenderer = (
  toolRenderers: ReadonlyArray<ToolRendererContribution>,
  toolName: string,
): ToolRendererContribution["component"] | undefined =>
  toolRenderers.find((renderer) => renderer.toolName === toolName)?.component;

const resolveContributions = (
  contributions: CoreWebContributions,
): ResolvedCoreWebContributions => {
  const nav = mergeNavContributions(contributions.nav);
  const pages = contributions.pages ?? [];
  const toolRenderers = contributions.toolRenderers ?? [];
  const toolRendererByName = new Map(
    toolRenderers.map((renderer) => [renderer.toolName, renderer.component]),
  );
  const componentRenderers = contributions.componentRenderers ?? [];
  const componentRendererByName = new Map(
    componentRenderers.map((renderer) => [renderer.name, renderer.component]),
  );
  return {
    nav,
    pages,
    toolRenderers,
    toolRendererByName,
    componentRenderers,
    componentRendererByName,
  };
};

const emptyContributions = resolveContributions({});

const CoreWebContributionsContext = createContext<ResolvedCoreWebContributions>(emptyContributions);

export const CoreWebProvider = ({
  contributions,
  children,
}: {
  contributions: CoreWebContributions;
  children: ReactNode;
}) => {
  const resolved = useMemo(() => resolveContributions(contributions), [contributions]);
  return (
    <CoreWebContributionsContext.Provider value={resolved}>
      {children}
    </CoreWebContributionsContext.Provider>
  );
};

export const useCoreWebContributions = (): ResolvedCoreWebContributions =>
  useContext(CoreWebContributionsContext);

export const useToolRenderer = (
  toolName: string,
): ToolRendererContribution["component"] | undefined => {
  const { toolRendererByName } = useCoreWebContributions();
  return toolRendererByName.get(toolName);
};

export const useComponentRenderer = (
  name: string,
): ComponentRendererContribution["component"] | undefined => {
  const { componentRendererByName } = useCoreWebContributions();
  return componentRendererByName.get(name);
};
