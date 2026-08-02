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

  it("blocks unsafe markdown links and http images", () => {
    render(
      <MessagePart
        part={{
          type: "text",
          text: "[xss](javascript:alert(1)) ![shot](http://evil.example/a.png)",
        }}
        isStreaming={false}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("xss")).toBeInTheDocument();
    expect(screen.getByText("[image: shot]")).toBeInTheDocument();
  });

  it("blocks unsafe citation and attachment URLs", () => {
    render(
      <CoreWebProvider contributions={{}}>
        <ToolResultContent
          toolName="web_search"
          result={{
            results: [{ title: "Unsafe citation", url: "javascript:alert(1)" }],
          }}
        />
        <MessagePart
          part={{
            type: "file",
            url: "javascript:alert(1)",
            mediaType: "image/png",
            filename: "unsafe.png",
          }}
          isStreaming={false}
        />
      </CoreWebProvider>,
    );

    expect(screen.queryByRole("link", { name: "Unsafe citation" })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Unsafe citation")).toBeInTheDocument();
    expect(screen.getByText("[attachment blocked]")).toBeInTheDocument();
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

  it("opens rich tool results but keeps raw JSON folded", () => {
    const Renderer = ({ result }: { result: unknown }) => <div>{String(result)}</div>;
    render(
      <CoreWebProvider
        contributions={{
          toolRenderers: [{ toolName: "ping", component: Renderer }],
        }}
      >
        <MessagePart
          part={{
            type: "tool-invocation",
            toolName: "summary",
            state: "output-available",
            output: {},
          }}
          isStreaming={false}
        />
        <MessagePart
          part={{
            type: "tool-invocation",
            toolName: "ping",
            state: "output-available",
            output: "pong",
          }}
          isStreaming={false}
        />
        <MessagePart
          part={{
            type: "tool-invocation",
            toolName: "render_component",
            state: "output-available",
            output: {},
          }}
          isStreaming={false}
        />
      </CoreWebProvider>,
    );

    expect(screen.getByText("summary").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("ping").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("render component").closest("details")).toHaveAttribute("open");
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
