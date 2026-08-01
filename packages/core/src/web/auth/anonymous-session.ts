export const anonymousSignInPath = "/api/auth/sign-in/anonymous";

export const startAnonymousSession = async ({
  apiOrigin,
  fetch,
}: {
  apiOrigin: string;
  fetch: typeof globalThis.fetch;
}): Promise<boolean> => {
  const normalizedApiOrigin = apiOrigin.endsWith("/") ? apiOrigin.slice(0, -1) : apiOrigin;
  try {
    const response = await fetch(`${normalizedApiOrigin}${anonymousSignInPath}`, {
      credentials: "include",
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const createAnonymousSessionFetch = ({
  apiOrigin,
  fetch,
}: {
  apiOrigin: string;
  fetch: typeof globalThis.fetch;
}): typeof globalThis.fetch => {
  const normalizedApiOrigin = apiOrigin.endsWith("/") ? apiOrigin.slice(0, -1) : apiOrigin;
  let sessionPromise: Promise<boolean> | undefined;

  const ensureAnonymousSession = (): Promise<boolean> => {
    sessionPromise ??= startAnonymousSession({ apiOrigin: normalizedApiOrigin, fetch });
    return sessionPromise;
  };

  return async (input, init) => {
    const inputUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(inputUrl, normalizedApiOrigin || "http://localhost").pathname;
    const response = await fetch(input, {
      ...init,
      credentials: init?.credentials ?? "include",
    });
    if (response.status !== 401 || pathname.startsWith("/api/auth/")) return response;
    if (!(await ensureAnonymousSession())) return response;
    return fetch(input, {
      ...init,
      credentials: init?.credentials ?? "include",
    });
  };
};
