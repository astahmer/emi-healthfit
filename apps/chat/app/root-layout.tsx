import { Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActionFeedbackProvider } from "./action-feedback";
import { AuthBoundary } from "./auth-boundary";
import { NavHeader } from "./nav-header";
import { QueryProvider } from "./query-provider";
import { ServiceWorkerReload } from "./service-worker-reload";
import { ThemeProvider } from "./theme-provider";

export const RootLayout = () => (
  <QueryProvider>
    <ThemeProvider>
      <ActionFeedbackProvider>
        <TooltipProvider>
          <ServiceWorkerReload />
          <AuthBoundary>
            <div className="flex h-dvh flex-col bg-background text-foreground">
              <NavHeader />
              <div
                className="min-h-0 flex-1 overflow-auto"
                data-testid="app-scroll-region"
                data-scroll-restoration-id="app-scroll-region"
              >
                <Outlet />
              </div>
            </div>
          </AuthBoundary>
        </TooltipProvider>
      </ActionFeedbackProvider>
    </ThemeProvider>
  </QueryProvider>
);
