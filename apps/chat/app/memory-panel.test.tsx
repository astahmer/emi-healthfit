import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { ActionFeedbackProvider } from "./action-feedback";
import { MemoryPanel } from "./memory-panel";
import { MemoryDomain } from "./memories";

vi.mock("./memories", () => ({
  MemoryDomain: {
    provenance: (memory: { source: string | null }) => ({
      source: memory.source,
      conversationId: null,
      messageId: undefined,
    }),
    list: vi.fn(),
    summary: vi.fn(),
    create: vi.fn(),
  },
}));

const memoryRow = {
  id: "memory-1",
  content: "Prefers concise answers",
  source: "manual",
  created_at: "2026-07-14T10:00:00.000Z",
  deleted: false,
};

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActionFeedbackProvider>
        <MemoryPanel />
      </ActionFeedbackProvider>
    </QueryClientProvider>,
  ) as ReactNode & { unmount: () => void };
};

const mocked = () => vi.mocked(MemoryDomain.list);

describe("MemoryPanel query failures", () => {
  it("shows a friendly card with retry instead of the raw query error for the list", async () => {
    mocked().mockImplementation(async ({ deleted }: { deleted?: boolean }) => {
      if (deleted !== true) throw new TypeError(`["memories","list"] data is undefined`);
      return [];
    });
    vi.mocked(MemoryDomain.summary).mockResolvedValue(null);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Couldn't load memories.")).toBeVisible();
    });
    expect(screen.queryByText(/data is undefined/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("recovers through the retry button after the summary query fails", async () => {
    const user = userEvent.setup();
    let failSummary = true;
    vi.mocked(MemoryDomain.list).mockImplementation(async ({ deleted }: { deleted?: boolean }) =>
      deleted === true ? [] : [memoryRow],
    );
    vi.mocked(MemoryDomain.summary).mockImplementation(async () => {
      if (failSummary) {
        throw new TypeError(`["memories","summary"] data is undefined`);
      }
      return {
        content: "Merged summary",
        memory_count: 1,
        updated_at: "2026-07-14T11:00:00.000Z",
      };
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Couldn't load the memory summary.")).toBeVisible();
    });
    expect(screen.queryByText(/data is undefined/)).not.toBeInTheDocument();

    failSummary = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Merged summary")).toBeVisible();
    });
    expect(screen.queryByText("Couldn't load the memory summary.")).not.toBeInTheDocument();
  });

  it("keeps loading and empty states intact when queries succeed", async () => {
    vi.mocked(MemoryDomain.list).mockImplementation(async ({ deleted }: { deleted?: boolean }) =>
      deleted === true ? [] : [memoryRow],
    );
    vi.mocked(MemoryDomain.summary).mockResolvedValue(null);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Prefers concise answers")).toBeVisible();
    });
    expect(screen.getByText("No summary has been saved yet.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
