import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

type ListArgs = NonNullable<Parameters<(typeof MemoryDomain)["list"]>[0]>;

const memoryRow = {
  id: "memory-1",
  content: "Prefers concise answers",
  source: "manual",
  thread_id: null,
  created_at: "2026-07-14T10:00:00.000Z",
  deleted: false,
  rank: 1,
};

const memorySummary = {
  content: "Merged summary",
  memory_count: 1,
  updated_at: "2026-07-14T11:00:00.000Z",
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
  );
};

describe("MemoryPanel query failures", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a friendly card with retry instead of the raw query error for the list", async () => {
    vi.mocked(MemoryDomain.list).mockImplementation(async (args?: ListArgs) => {
      const deleted = args?.deleted;
      if (deleted === true) return [];
      throw new TypeError(`["memories","list"] data is undefined`);
    });
    vi.mocked(MemoryDomain.summary).mockResolvedValue({
      content: "",
      memory_count: 0,
      updated_at: "2026-07-14T10:00:00.000Z",
    });

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
    vi.mocked(MemoryDomain.list).mockImplementation(async (args?: ListArgs) => {
      const deleted = args?.deleted;
      return deleted === true ? [] : [memoryRow];
    });
    vi.mocked(MemoryDomain.summary).mockImplementation(async () => {
      if (failSummary) {
        throw new TypeError(`["memories","summary"] data is undefined`);
      }
      return memorySummary;
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
    vi.mocked(MemoryDomain.list).mockImplementation(async (args?: ListArgs) => {
      const deleted = args?.deleted;
      return deleted === true ? [] : [memoryRow];
    });
    vi.mocked(MemoryDomain.summary).mockResolvedValue({
      content: "",
      memory_count: 0,
      updated_at: "2026-07-14T10:00:00.000Z",
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Prefers concise answers")).toBeVisible();
    });
    expect(screen.getByText(/0 source memories/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("treats a null summary payload as an empty state instead of crashing", async () => {
    vi.mocked(MemoryDomain.list).mockImplementation(async (args?: ListArgs) => {
      const deleted = args?.deleted;
      return deleted === true ? [] : [memoryRow];
    });
    vi.mocked(MemoryDomain.summary).mockResolvedValue(
      null as unknown as { content: string; memory_count: number; updated_at: string },
    );

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Prefers concise answers")).toBeVisible();
    });
    expect(screen.getByText("No summary has been saved yet.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
