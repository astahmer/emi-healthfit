"use client";

import { type ComponentType, type ReactNode } from "react";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  DynamicComponentEnvelopeSchema,
  type DynamicComponentElement,
  type DynamicComponentEnvelope,
} from "../protocol/parts.ts";
import { useComponentRenderer } from "./contributions.tsx";
import { cn } from "./cn.ts";

export interface DynamicComponentRendererProps {
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: ReactNode;
  readonly className?: string;
}

export interface ComponentRendererContribution {
  readonly name: string;
  readonly component: ComponentType<DynamicComponentRendererProps>;
}

export const decodeDynamicComponent = (value: unknown): DynamicComponentEnvelope | undefined => {
  const decoded = Schema.decodeUnknownOption(DynamicComponentEnvelopeSchema)(value);
  if (Option.isNone(decoded)) return undefined;

  const { spec } = decoded.value;
  const elementIds = new Set(Object.keys(spec.elements));
  if (!elementIds.has(spec.root)) return undefined;
  for (const element of Object.values(spec.elements)) {
    for (const childId of element.children ?? []) {
      if (!elementIds.has(childId)) return undefined;
    }
  }
  return decoded.value;
};

const fallbackValue = ({ reason, element }: { reason: string; element?: string }) => (
  <pre
    className={cn(
      "mt-1 rounded-md bg-muted/50 p-2.5 text-xs whitespace-pre-wrap text-foreground/90",
    )}
    data-testid="dynamic-component-fallback"
  >
    {JSON.stringify({
      type: "dynamic-component-fallback",
      reason,
      ...(element === undefined ? {} : { element }),
    })}
  </pre>
);

const DynamicComponentElement = ({
  element,
  elementId,
  spec,
  ancestors,
  className,
}: {
  readonly element: DynamicComponentElement;
  readonly elementId: string;
  readonly spec: DynamicComponentEnvelope["spec"];
  readonly ancestors: ReadonlySet<string>;
  readonly className?: string;
}): ReactNode => {
  if (element.visible === false) return null;
  if (ancestors.has(elementId))
    return fallbackValue({ reason: "cyclic-element", element: elementId });

  const Renderer = useComponentRenderer(element.type);
  if (Renderer === undefined)
    return fallbackValue({ reason: "unregistered-component", element: element.type });

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(elementId);
  const children = (element.children ?? []).map((childId) => (
    <DynamicComponentElement
      key={childId}
      elementId={childId}
      element={spec.elements[childId]}
      spec={spec}
      ancestors={nextAncestors}
      className={className}
    />
  ));
  return (
    <Renderer className={className} props={element.props}>
      {children}
    </Renderer>
  );
};

export const DynamicComponentRenderer = ({
  value,
  className,
}: {
  readonly value: unknown;
  readonly className?: string;
}): ReactNode => {
  const decoded = decodeDynamicComponent(value);
  if (decoded === undefined) return fallbackValue({ reason: "invalid-spec" });
  const root = decoded.spec.elements[decoded.spec.root];
  return (
    <DynamicComponentElement
      element={root}
      elementId={decoded.spec.root}
      ancestors={new Set()}
      className={className}
      spec={decoded.spec}
    />
  );
};
