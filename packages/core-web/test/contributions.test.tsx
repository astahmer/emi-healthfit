import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CoreWebProvider,
  mergeNavContributions,
  resolveToolRenderer,
  useCoreWebContributions,
  useToolRenderer,
} from "../src/contributions.tsx";

describe("mergeNavContributions", () => {
  it("sorts nav contributions in ascending order, undefined order last", () => {
    const merged = mergeNavContributions([
      { id: "b", label: "B", href: "/b", order: 2 },
      { id: "a", label: "A", href: "/a", order: 1 },
      { id: "c", label: "C", href: "/c" },
    ]);
    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when no contributions are given", () => {
    expect(mergeNavContributions()).toEqual([]);
  });
});

const NavList = () => {
  const { nav } = useCoreWebContributions();
  return (
    <ul>
      {nav.map((item) => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  );
};

describe("CoreWebProvider", () => {
  it("provides nav contributions merged by order to consumers", () => {
    render(
      <CoreWebProvider
        contributions={{
          nav: [
            { id: "second", label: "Second", href: "/second", order: 2 },
            { id: "first", label: "First", href: "/first", order: 1 },
          ],
        }}
      >
        <NavList />
      </CoreWebProvider>,
    );

    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["First", "Second"]);
  });

  it("falls back to empty contributions when rendered without a provider", () => {
    render(<NavList />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("tool renderer registry", () => {
  const Widget = () => <span>widget</span>;
  const toolRenderers = [{ toolName: "get_widget", component: Widget }];

  it("resolves a renderer by tool name", () => {
    expect(resolveToolRenderer(toolRenderers, "get_widget")).toBe(Widget);
  });

  it("returns undefined for an unregistered tool name", () => {
    expect(resolveToolRenderer(toolRenderers, "unknown_tool")).toBeUndefined();
  });

  it("resolves the matching component through useToolRenderer inside a provider", () => {
    const Consumer = () => {
      const Renderer = useToolRenderer("get_widget");
      return Renderer !== undefined ? <Renderer result={null} /> : <span>missing</span>;
    };

    render(
      <CoreWebProvider contributions={{ toolRenderers }}>
        <Consumer />
      </CoreWebProvider>,
    );

    expect(screen.getByText("widget")).toBeInTheDocument();
  });

  it("returns undefined through useToolRenderer when no contribution matches", () => {
    const Consumer = () => {
      const Renderer = useToolRenderer("unknown_tool");
      return Renderer !== undefined ? <Renderer result={null} /> : <span>missing</span>;
    };

    render(
      <CoreWebProvider contributions={{ toolRenderers }}>
        <Consumer />
      </CoreWebProvider>,
    );

    expect(screen.getByText("missing")).toBeInTheDocument();
  });
});
