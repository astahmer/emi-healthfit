import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CoreWebProvider,
  FallbackResult,
  ToolResultContent,
  type CoreWebContributions,
} from "../../src/web.export.ts";

describe("ToolResultContent", () => {
  it("renders parsed string results as preformatted text", () => {
    render(<ToolResultContent toolName="get_summary" result="plain summary" />);

    expect(screen.getByText("plain summary")).toBeInTheDocument();
  });

  it("renders object results as formatted JSON", () => {
    render(<ToolResultContent toolName="get_data" result={{ reps: 8, weight: 100 }} />);

    expect(screen.getByText(/\{[\s\S]*"reps": 8/)).toBeInTheDocument();
  });

  it("parses JSON-string results before rendering", () => {
    render(<ToolResultContent toolName="get_data" result={JSON.stringify({ ok: true })} />);

    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  });

  it("renders error-text results as a destructive message", () => {
    render(
      <ToolResultContent toolName="failing_tool" result={{ type: "error-text", value: "boom" }} />,
    );

    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("renders warning-text results as a warning message", () => {
    render(
      <ToolResultContent
        toolName="warned_tool"
        result={{ type: "warning-text", value: "partial data" }}
      />,
    );

    expect(screen.getByText("partial data")).toBeInTheDocument();
  });

  it("renders web_search citations with safe links", () => {
    render(
      <ToolResultContent
        toolName="web_search"
        result={{
          results: [
            { title: "Study", url: "https://example.com/study", content: "Findings here" },
            { title: "Unsafe", url: "javascript:alert(1)", content: "no link" },
          ],
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "Study" });
    expect(link).toHaveAttribute("href", "https://example.com/study");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Findings here")).toBeInTheDocument();
    expect(screen.getByText("Unsafe")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Unsafe" })).toBeNull();
  });

  it("falls back to serialized JSON when a render_component spec is invalid", () => {
    render(<ToolResultContent toolName="render_component" result={{ spec: { broken: true } }} />);

    expect(screen.getByText(/dynamic-component-fallback/)).toBeInTheDocument();
    expect(screen.getByText(/invalid-spec/)).toBeInTheDocument();
  });

  it("prefers a registered tool renderer over the fallback output", () => {
    const contributions: CoreWebContributions = {
      toolRenderers: [
        {
          toolName: "custom_tool",
          component: ({ result }) => (
            <p>custom renderer:{typeof result === "object" ? "object" : String(result)}</p>
          ),
        },
      ],
    };
    render(
      <CoreWebProvider contributions={contributions}>
        <ToolResultContent toolName="custom_tool" result={{ custom: true }} />
      </CoreWebProvider>,
    );

    expect(screen.getByText("custom renderer:object")).toBeInTheDocument();
  });

  it("exposes the shared fallback renderer", () => {
    render(<FallbackResult value={{ fallback: true }} />);

    expect(screen.getByText(/"fallback": true/)).toBeInTheDocument();
  });
});

describe("tool result card distinction", () => {
  it("wraps fallback output in a bordered card with a tool-name header", () => {
    render(<ToolResultContent toolName="get_recovery" result={{ status: "Ready" }} />);

    const card = screen.getByTestId("tool-result-card");
    expect(card.className).toContain("border");
    expect(card.className).toContain("rounded-xl");
    expect(screen.getByText("get_recovery")).toBeTruthy();
  });
});
