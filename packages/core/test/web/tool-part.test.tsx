import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CoreWebProvider } from "../../src/web/contributions.tsx";
import { ToolPart, type MessagePartValue } from "../../src/web/thread/tool-part.tsx";

const renderToolPart = (part: MessagePartValue) =>
  render(
    <CoreWebProvider contributions={{}}>
      <ToolPart isStreaming={false} part={part} />
    </CoreWebProvider>,
  );

describe("ToolPart", () => {
  it("keeps hook order stable when a message part changes from text to a tool", () => {
    const view = renderToolPart({ type: "text", text: "ordinary message" });

    view.rerender(
      <CoreWebProvider contributions={{}}>
        <ToolPart isStreaming={false} part={{ type: "tool-invocation", toolName: "weather" }} />
      </CoreWebProvider>,
    );

    expect(screen.getByText("weather")).toBeVisible();
  });
});
