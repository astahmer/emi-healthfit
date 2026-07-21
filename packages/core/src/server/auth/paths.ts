export const isProtectedPath = (pathname: string): boolean =>
  pathname === "/ingest" || pathname === "/chat" || pathname.startsWith("/api/");

export const isGenericProtectedPath = (pathname: string): boolean =>
  pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && pathname !== "/api/health";
