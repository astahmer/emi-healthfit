import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useThreadData } from "./use-thread-data";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe("useThreadData", () => {
  it("returns empty data when no session is selected", () => {
    const { result } = renderHook(() => useThreadData(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toEqual({ thread: null, messages: [] });
    expect(result.current.isLoading).toBe(false);
  });

  it("loads the full thread including messages for an existing session", async () => {
    const thread = {
      id: "thread-1",
      title: "Squat Session Showdown",
      status: "regular",
      created_at: "2026-07-14T11:37:55.245Z",
      updated_at: "2026-07-14T11:42:25.844Z",
    };
    const messages = [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Compare my recent squat sessions." }],
        createdAt: "2026-07-14T11:37:55.572Z",
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ thread, messages }),
    });

    const { result } = renderHook(() => useThreadData("thread-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.thread).toEqual(thread);
    expect(result.current.data?.messages).toEqual(messages);
    expect(result.current.error).toBeNull();
  });

  it("exposes fetch errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useThreadData("thread-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toEqual({ thread: null, messages: [] });
  });
});
