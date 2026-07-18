import { Navigate, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient } from "./auth-client";

export const AuthBoundary = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const pathname = location.pathname;
  const session = authClient.useSession();
  const isAuthRoute = pathname === "/auth" || pathname.startsWith("/auth/");

  if (isAuthRoute) return children;
  if (session.isPending) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }
  if (session.data === null) {
    return <Navigate to="/auth" search={{ next: `${pathname}${location.searchStr}` }} replace />;
  }
  return children;
};
