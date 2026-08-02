import { createChatRuntime } from "@emi/core";
import { ChatApp } from "@emi/core/components/styled";
import { ChatProvider } from "@emi/core/react";
import { useMemo } from "react";

import "./app.css";
import { genericChatAppConfig } from "./app-config.ts";

const anonymousSignInPath = "/api/auth/sign-in/anonymous";

const createAnonymousSessionFetch = ({
  apiOrigin,
  fetch,
}: {
  readonly apiOrigin: string;
  readonly fetch: typeof globalThis.fetch;
}): typeof globalThis.fetch => {
  const normalizedOrigin = apiOrigin.replace(/\/$/, "");
  let sessionPromise: Promise<boolean> | undefined;
  const startSession = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${normalizedOrigin}${anonymousSignInPath}`, {
        credentials: "include",
        method: "POST",
      });
      return response.ok;
    } catch {
      return false;
    }
  };
  return async (input, init) => {
    const inputUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(inputUrl, normalizedOrigin || "http://localhost").pathname;
    const requestInit: RequestInit = { ...init, credentials: init?.credentials ?? "include" };
    const response = await fetch(input, requestInit);
    if (response.status !== 401 || pathname.startsWith("/api/auth/")) return response;
    sessionPromise ??= startSession();
    if (!(await sessionPromise)) return response;
    return fetch(input, requestInit);
  };
};

export const App = () => {
  const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
  const fetcher = useMemo(
    () => createAnonymousSessionFetch({ apiOrigin, fetch: window.fetch.bind(window) }),
    [apiOrigin],
  );
  const runtime = useMemo(
    () =>
      createChatRuntime({
        transport: { baseUrl: `${apiOrigin}/api`, fetch: fetcher },
        storage: {
          settings: {
            get: (key) => window.localStorage.getItem(key),
            set: (key, value) => window.localStorage.setItem(key, value),
            remove: (key) => window.localStorage.removeItem(key),
          },
          drafts: {
            get: (key) => window.localStorage.getItem(key),
            set: (key, value) => window.localStorage.setItem(key, value),
            remove: (key) => window.localStorage.removeItem(key),
          },
          keys: {
            settings: genericChatAppConfig.settingsStorageKey,
            drafts: `${genericChatAppConfig.settingsStorageKey}:draft`,
          },
        },
        browser: {
          online: navigator.onLine,
          subscribeOnline: (listener) => {
            const update = () => listener(navigator.onLine);
            window.addEventListener("online", update);
            window.addEventListener("offline", update);
            return () => {
              window.removeEventListener("online", update);
              window.removeEventListener("offline", update);
            };
          },
        },
        identity: { createId: () => crypto.randomUUID(), now: () => new Date().toISOString() },
        features: { attachments: true, memories: true, branches: true },
      }),
    [apiOrigin, fetcher],
  );

  return (
    <ChatProvider runtime={runtime}>
      <ChatApp
        appName={genericChatAppConfig.name}
        releaseNotes={genericChatAppConfig.releaseNotes}
        version={genericChatAppConfig.version}
      />
    </ChatProvider>
  );
};
