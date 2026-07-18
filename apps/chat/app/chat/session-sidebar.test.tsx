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

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: ({ select }: { select: (location: { pathname: string }) => string }) =>
    select({ pathname: "/chat" }),
  useNavigate: () => vi.fn(),
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
      pinned: false,
      created_at: "2026-07-14T11:37:55.245Z",
      updated_at: "2026-07-14T11:42:25.844Z",
    };

    global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL) => {
      if (String(url) === `${window.location.origin}/api/conversations`) {
        return Promise.resolve(
          new Response(JSON.stringify({ conversations: [thread] }), {
            headers: { "content-type": "application/json" },
          }),
        );
      }

      if (String(url) === `${window.location.origin}/api/conversations/thread-1/messages`) {
        return Promise.resolve(
          new Response(JSON.stringify({ conversation: thread, messages: [], threads: [] }), {
            headers: { "content-type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<SessionSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Squat Session Showdown")).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /squat session showdown/i });
    fireEvent.mouseEnter(link);

    await waitFor(() => {
      expect(
        vi
          .mocked(global.fetch)
          .mock.calls.some(
            ([url]) =>
              String(url) === `${window.location.origin}/api/conversations/thread-1/messages`,
          ),
      ).toBe(true);
    });
  });
});
