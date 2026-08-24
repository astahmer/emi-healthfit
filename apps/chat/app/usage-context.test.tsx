import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ConversationUsage, UsageProvider, useUsage } from "./usage-context";
import { useSettings } from "./settings-store";
import type { MessageWithUsage } from "./sessions";

const UsageProbe = () => {
  const usage = useUsage();
  return <output data-testid="total-tokens">{usage.totalUsage.totalTokens}</output>;
};

const messages: MessageWithUsage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text: "done" }],
    model: "gpt-4o-mini",
    usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
  },
];

const enableBudgetFeature = () => {
  useSettings.setState({
    settings: { ...useSettings.getState().settings, tokenBudgetEnabled: true },
  });
};

describe("usage compositions", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.setState({
      settings: {
        ...useSettings.getState().settings,
        showTokenUsage: false,
        tokenBudgetEnabled: false,
      },
    });
  });

  it("renders nothing while the token budget feature is opt-out", () => {
    localStorage.setItem("emi-healthfit:token-budget:conversation-1", "200000");
    render(
      <UsageProvider messages={messages}>
        <UsageProbe />
        <ConversationUsage conversationId="conversation-1" />
      </UsageProvider>,
    );

    expect(screen.getByTestId("total-tokens")).toHaveTextContent("140");
    expect(screen.queryByText(/Token usage/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Token budget")).not.toBeInTheDocument();
  });

  it("appears once enabled and persists a per-conversation budget", () => {
    enableBudgetFeature();
    localStorage.setItem("emi-healthfit:token-budget:conversation-1", "200000");
    render(
      <UsageProvider messages={messages}>
        <UsageProbe />
        <ConversationUsage conversationId="conversation-1" />
      </UsageProvider>,
    );

    fireEvent.click(screen.getByText("Token usage"));
    expect(screen.getByLabelText("Token budget")).toHaveValue(200000);
    fireEvent.change(screen.getByLabelText("Token budget"), { target: { value: "300000" } });
    expect(localStorage.getItem("emi-healthfit:token-budget:conversation-1")).toBe("300000");
    expect(screen.getByText(/100 input · 40 output/)).toBeInTheDocument();
  });

  it("shows the real percentage and an over-budget state once enabled", () => {
    enableBudgetFeature();
    localStorage.setItem("emi-healthfit:token-budget:conversation-1", "100");
    render(
      <UsageProvider messages={messages}>
        <ConversationUsage conversationId="conversation-1" />
      </UsageProvider>,
    );

    fireEvent.click(screen.getByText("Token usage"));
    expect(screen.getByText(/140% used/)).toBeInTheDocument();
    expect(screen.getByText(/over budget/)).toBeInTheDocument();
  });

  it("falls back to the settings default without a stored budget", () => {
    enableBudgetFeature();
    localStorage.removeItem("emi-healthfit:token-budget:conversation-2");
    render(
      <UsageProvider messages={messages}>
        <ConversationUsage conversationId="conversation-2" />
      </UsageProvider>,
    );

    fireEvent.click(screen.getByText("Token usage"));
    expect(screen.getByLabelText("Token budget")).toHaveValue(10000000);
  });

  it("hides the progress bar when the budget is disabled", () => {
    enableBudgetFeature();
    localStorage.setItem("emi-healthfit:token-budget:conversation-3", "0");
    render(
      <UsageProvider messages={messages}>
        <ConversationUsage conversationId="conversation-3" />
      </UsageProvider>,
    );

    fireEvent.click(screen.getByText("Token usage"));
    expect(screen.getByText(/No budget set for this conversation/)).toBeInTheDocument();
  });
});
