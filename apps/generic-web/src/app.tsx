import { createAuthClient } from "better-auth/react";
import { useMemo, useSyncExternalStore } from "react";
import { createChatRuntime } from "@emi/core";
import { ChatApp } from "@emi/core/components/styled";
import { ChatProvider } from "@emi/core/react";
import { AnonymousSession, AuthSession } from "@emi/core/web";

import "./app.css";
import { genericChatAppConfig } from "./app-config.ts";

const AuthGate = ({
  session,
  status,
}: {
  readonly session: AuthSession;
  readonly status: "signed-out" | "starting" | "authenticated" | "error";
}) => {
  if (status === "authenticated") return null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,hsl(var(--muted)),transparent_45%)] px-6">
      <section className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-2xl shadow-black/10">
        <div className="mb-8 space-y-3">
          <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
            Emi Core
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome to Core Chat</h1>
          <p className="leading-7 text-muted-foreground">
            Continue as a guest for a browser-only session, or sign in with an approved Google
            account.
          </p>
        </div>
        <button
          className="h-12 w-full rounded-xl bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60"
          onClick={session.signInAsGuest}
          disabled={status === "starting"}
          type="button"
        >
          {status === "starting" ? "Connecting…" : "Continue as guest"}
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <button
          className="h-12 w-full rounded-xl border bg-background px-4 font-medium disabled:opacity-60"
          onClick={session.signInWithOAuth}
          disabled={status === "starting"}
          type="button"
        >
          Continue with Google
        </button>
        {status === "error" && (
          <p className="mt-4 text-center text-sm text-destructive" role="alert">
            Sign-in could not be started. Try again.
          </p>
        )}
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Guest data stays in this browser. Google sign-in is handled by the configured server.
        </p>
      </section>
    </main>
  );
};

export const App = () => {
  const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
  const rawFetch = useMemo(() => window.fetch.bind(window), []);
  const authClient = useMemo(
    () => createAuthClient({ baseURL: apiOrigin || undefined }),
    [apiOrigin],
  );
  const authSession = useMemo(
    () =>
      new AuthSession({
        signInAsGuest: () => AnonymousSession.start({ apiOrigin, fetch: rawFetch }),
        signInWithOAuth: async () => {
          const result = await authClient.signIn.social({
            provider: "google",
            callbackURL: window.location.href,
            errorCallbackURL: window.location.href,
          });
          return result.error === null;
        },
      }),
    [apiOrigin, authClient, rawFetch],
  );
  const authStatus = useSyncExternalStore(
    authSession.subscribe,
    authSession.getState,
    authSession.getState,
  );
  const fetcher = useMemo(
    () =>
      AnonymousSession.createFetch({
        apiOrigin,
        fetch: rawFetch,
      }),
    [apiOrigin, rawFetch],
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

  if (authStatus !== "authenticated") return <AuthGate session={authSession} status={authStatus} />;

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
