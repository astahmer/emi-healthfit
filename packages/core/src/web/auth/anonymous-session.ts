export class AnonymousSession {
  static readonly signInPath = "/api/auth/sign-in/anonymous";

  static async start({
    apiOrigin,
    fetch,
  }: {
    apiOrigin: string;
    fetch: typeof globalThis.fetch;
  }): Promise<boolean> {
    const normalizedApiOrigin = AnonymousSession.normalizeOrigin(apiOrigin);
    try {
      const response = await fetch(`${normalizedApiOrigin}${AnonymousSession.signInPath}`, {
        credentials: "include",
        method: "POST",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  static createFetch({
    apiOrigin,
    fetch,
  }: {
    apiOrigin: string;
    fetch: typeof globalThis.fetch;
  }): typeof globalThis.fetch {
    const normalizedApiOrigin = AnonymousSession.normalizeOrigin(apiOrigin);
    let sessionPromise: Promise<boolean> | undefined;

    const ensureAnonymousSession = (): Promise<boolean> => {
      sessionPromise ??= AnonymousSession.start({ apiOrigin: normalizedApiOrigin, fetch });
      return sessionPromise;
    };

    return async (input, init) => {
      const inputUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const pathname = new URL(inputUrl, normalizedApiOrigin || "http://localhost").pathname;
      const requestInit: RequestInit = {
        ...init,
        credentials: init?.credentials ?? "include",
      };
      const response = await fetch(input, requestInit);
      if (response.status !== 401 || pathname.startsWith("/api/auth/")) return response;
      if (!(await ensureAnonymousSession())) return response;
      return fetch(input, requestInit);
    };
  }

  private static normalizeOrigin(apiOrigin: string): string {
    return apiOrigin.endsWith("/") ? apiOrigin.slice(0, -1) : apiOrigin;
  }
}
