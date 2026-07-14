import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionSidebar } from "./session-sidebar";

vi.mock("@/app/session-cache", () => ({
  getCachedThreads: vi.fn().mockResolvedValue([]),
  setCachedThreads: vi.fn().mockResolvedValue(undefined),
  updateCachedThread: vi.fn().mockResolvedValue(undefined),
  deleteCachedThread: vi.fn().mockResolvedValue(undefined),
  getCachedMessages: vi.fn().mockResolvedValue([]),
  setCachedMessages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/chat",
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SidebarProvider>{children}</SidebarProvider>
        </TooltipProvider>
      </QueryClientProvider>
    );
  };
};

describe("SessionSidebar", () => {
  it("prefetches thread messages when hovering a session", async () => {
    const thread = {
      id: "thread-1",
      title: "Squat Session Showdown",
      status: "regular",
      created_at: "2026-07-14T11:37:55.245Z",
      updated_at: "2026-07-14T11:42:25.844Z",
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === `${window.location.origin}/api/conversations`) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: [thread] }),
        });
      }

      if (url === `${window.location.origin}/api/conversations/thread-1/messages`) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversation: thread, messages: [], threads: [] }),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<SessionSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Squat Session Showdown")).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /squat session showdown/i });
    fireEvent.mouseEnter(link);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `${window.location.origin}/api/conversations/thread-1/messages`,
      );
    });
  });
});
