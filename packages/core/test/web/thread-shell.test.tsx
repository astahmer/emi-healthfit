import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoreWebProvider } from "../../src/web/contributions.tsx";
import { MessagePart } from "../../src/web/thread/message-part.tsx";
import { ThreadViewport } from "../../src/web/thread/thread-viewport.tsx";
import { ToolResultContent } from "../../src/web/thread/tool-result-content.tsx";

describe("core thread shell", () => {
  it("renders markdown text parts without app-local imports", () => {
    render(<MessagePart part={{ type: "text", text: "Hello **coach**" }} isStreaming={false} />);
    expect(screen.getByText("coach")).toBeInTheDocument();
  });

  it("uses registered tool renderers from contributions", () => {
    const Renderer = ({ result }: { result: unknown }) => (
      <div data-testid="custom-tool">{String(result)}</div>
    );
    render(
      <CoreWebProvider
        contributions={{
          toolRenderers: [{ toolName: "ping", component: Renderer }],
        }}
      >
        <ToolResultContent toolName="ping" result={"pong"} />
      </CoreWebProvider>,
    );
    expect(screen.getByTestId("custom-tool")).toHaveTextContent("pong");
  });

  it("lays out empty, messages, and composer slots", () => {
    render(
      <ThreadViewport empty={<p>Empty</p>} messages={<p>Messages</p>} composer={<p>Composer</p>} />,
    );
    expect(screen.getByTestId("thread-viewport")).toBeInTheDocument();
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Composer")).toBeInTheDocument();
  });
});
