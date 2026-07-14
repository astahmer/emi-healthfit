import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FollowUpChips } from "./follow-up-chips";

const appendMock = vi.fn();
const invalidateQueriesMock = vi.fn();

const auiMock = {
  thread: () => ({ append: appendMock }),
};

vi.mock("@assistant-ui/react", () => ({
  useAui: () => auiMock,
  useAuiState: vi.fn(),
}));

vi.mock("@/app/settings-store", () => ({
  useSettings: () => ({
    settings: {
      provider: "openai",
      apiKey: "test-key",
      baseUrl: "",
      model: "gpt-4o-mini",
    },
  }),
}));

vi.mock("@/app/suggestions", () => ({
  fetchSuggestions: vi
    .fn()
    .mockResolvedValue([
      "short",
      "a very long follow-up suggestion that should wrap instead of overflowing its bubble container",
    ]),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.invalidateQueries = invalidateQueriesMock;
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe("FollowUpChips", () => {
  beforeEach(() => {
    appendMock.mockClear();
    invalidateQueriesMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("wraps long suggestion text instead of overflowing the button", async () => {
    const messageId = "msg-1";
    const { useAuiState } = await import("@assistant-ui/react");
    vi.mocked(useAuiState).mockImplementation((selector) =>
      selector({
        message: {
          id: messageId,
          role: "assistant",
          parts: [{ type: "text", text: "hello" }],
          status: { type: "complete" },
        },
        thread: {
          isRunning: false,
          messages: [
            { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
            { id: messageId, role: "assistant", parts: [{ type: "text", text: "hello" }] },
          ],
        },
      } as never),
    );

    render(<FollowUpChips />, { wrapper: createWrapper() });

    const longButton = await screen.findByText(/should wrap instead of overflowing/);
    expect(longButton).toHaveClass("whitespace-normal", "break-words", "max-w-full");
  });

  it("appends the suggestion text when a chip is clicked", async () => {
    const messageId = "msg-2";
    const { useAuiState } = await import("@assistant-ui/react");
    vi.mocked(useAuiState).mockImplementation((selector) =>
      selector({
        message: {
          id: messageId,
          role: "assistant",
          parts: [{ type: "text", text: "hello" }],
          status: { type: "complete" },
        },
        thread: {
          isRunning: false,
          messages: [
            { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
            { id: messageId, role: "assistant", parts: [{ type: "text", text: "hello" }] },
          ],
        },
      } as never),
    );

    render(<FollowUpChips />, { wrapper: createWrapper() });

    const chip = await screen.findByText("short");
    await userEvent.click(chip);

    expect(appendMock).toHaveBeenCalledWith({
      role: "user",
      content: [{ type: "text", text: "short" }],
    });
  });
});
