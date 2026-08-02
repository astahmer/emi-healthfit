import { createChatRuntime } from "@emi/core";
import { ChatApp } from "@emi/core/components/styled";
import { ConnectedSidebar, Sidebar } from "@emi/core/components";
import { ChatProvider, useChatActions, useChatSelector } from "@emi/core/react";
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

const Settings = () => {
  const settings = useChatSelector((state) => state.settings);
  const actions = useChatActions();
  const update = (patch: Partial<typeof settings>) => actions.updateSettings({ patch });
  return (
    <details>
      <summary>Settings</summary>
      <label>
        API key
        <input
          aria-label="API key"
          onChange={(event) => update({ apiKey: event.target.value })}
          type="password"
          value={settings.apiKey}
        />
      </label>
      <label>
        Default model
        <input
          aria-label="Default model"
          onChange={(event) => update({ model: event.target.value })}
          value={settings.model}
        />
      </label>
      <label>
        Title model
        <input
          aria-label="Title model"
          onChange={(event) => update({ titleModel: event.target.value })}
          value={settings.titleModel}
        />
      </label>
      <label>
        Memory model
        <input
          aria-label="Memory model"
          onChange={(event) => update({ memoryModel: event.target.value })}
          value={settings.memoryModel}
        />
      </label>
      <label>
        Default system prompt
        <textarea
          aria-label="Default system prompt"
          onChange={(event) => update({ systemPrompt: event.target.value })}
          value={settings.systemPrompt}
        />
      </label>
      <label>
        <input
          aria-label="Remember useful details from replies"
          checked={settings.memoryEnabled}
          onChange={(event) => update({ memoryEnabled: event.target.checked })}
          type="checkbox"
        />
        Remember useful details from replies
      </label>
      <label>
        Theme
        <select
          aria-label="Theme"
          onChange={(event) => update({ theme: event.target.value === "dark" ? "dark" : "light" })}
          value={settings.theme}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </details>
  );
};

const ChatScreen = () => {
  const temporary = useChatSelector((state) => state.temporary);
  const actions = useChatActions();
  return (
    <ChatApp
      slots={{
        header: (
          <header>
            <h2>How can I help?</h2>
            <p>Provider-neutral chat powered by the actor runtime.</p>
          </header>
        ),
        sidebar: (
          <Sidebar>
            <h1>{genericChatAppConfig.name}</h1>
            <button onClick={() => actions.startNewConversation()} type="button">
              New chat
            </button>
            <ConnectedSidebar />
            <Settings />
            <label>
              <input
                aria-label="Temporary chat"
                checked={temporary}
                onChange={(event) => actions.setTemporary({ temporary: event.target.checked })}
                type="checkbox"
              />
              Temporary chat
            </label>
          </Sidebar>
        ),
      }}
    />
  );
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
      <ChatScreen />
    </ChatProvider>
  );
};
