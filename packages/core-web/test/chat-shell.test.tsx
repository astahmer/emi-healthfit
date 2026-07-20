import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatShell } from "../src/chat-shell.tsx";
import { CoreWebProvider } from "../src/contributions.tsx";

describe("ChatShell", () => {
  it("renders the shell and children with empty contributions", () => {
    render(
      <ChatShell>
        <p>Body</p>
      </ChatShell>,
    );

    expect(screen.getByTestId("chat-shell")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders nav contributions as links in href order", () => {
    render(
      <CoreWebProvider
        contributions={{
          nav: [
            { id: "settings", label: "Settings", href: "/settings", order: 2 },
            { id: "chat", label: "Chat", href: "/chat", order: 1 },
          ],
        }}
      >
        <ChatShell activePath="/chat">
          <p>Body</p>
        </ChatShell>
      </CoreWebProvider>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Chat", "Settings"]);
    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });
});
