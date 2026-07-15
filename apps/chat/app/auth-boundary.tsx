"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "./auth-client";

export const AuthBoundary = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const session = authClient.useSession();
  const isAuthRoute = pathname === "/auth" || pathname.startsWith("/auth/");

  useEffect(() => {
    if (isAuthRoute || session.isPending || session.data !== null) return;
    const next = `${pathname}${window.location.search}`;
    router.replace(`/auth?next=${encodeURIComponent(next)}`);
  }, [isAuthRoute, pathname, router, session.data, session.isPending]);

  if (isAuthRoute) return children;
  if (session.isPending) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }
  if (session.data === null) return null;
  return children;
};
