import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  decodeDynamicComponent,
  DynamicComponentRenderer,
} from "../../src/web/dynamic-components.tsx";
import { CoreWebProvider } from "../../src/web/contributions.tsx";

const Card = ({
  props,
  children,
}: {
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: ReactNode;
}) => <section aria-label={String(props.label)}>{children}</section>;

const validValue = {
  spec: {
    root: "root",
    elements: {
      root: { type: "card", props: { label: "Root" }, children: ["child"] },
      child: { type: "card", props: { label: "Child" } },
    },
  },
};

describe("dynamic component envelopes", () => {
  it("decodes only complete element graphs", () => {
    expect(decodeDynamicComponent(validValue)?.spec.root).toBe("root");
    expect(
      decodeDynamicComponent({
        spec: {
          root: "root",
          elements: { root: { type: "card", props: {}, children: ["missing"] } },
        },
      }),
    ).toBeUndefined();
  });

  it("renders registered components and nested children", () => {
    render(
      <CoreWebProvider contributions={{ componentRenderers: [{ name: "card", component: Card }] }}>
        <DynamicComponentRenderer value={validValue} />
      </CoreWebProvider>,
    );

    expect(screen.getByRole("region", { name: "Root" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Child" })).toBeInTheDocument();
  });

  it("shows a safe fallback for unregistered components", () => {
    render(
      <CoreWebProvider contributions={{}}>
        <DynamicComponentRenderer value={validValue} />
      </CoreWebProvider>,
    );

    expect(screen.getByTestId("dynamic-component-fallback")).toHaveTextContent(
      '"reason":"unregistered-component"',
    );
  });
});
