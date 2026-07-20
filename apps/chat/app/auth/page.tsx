import { useState } from "react";
import { LoaderCircleIcon, LogInIcon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startAnonymousSession } from "../anonymous-auth";
import { authClient } from "../auth-client";

const safeNextPath = (value: string | null): string => {
  if (value === null || !value.startsWith("/") || value.startsWith("//")) return "/chat";
  if (value.startsWith("/api/") || value === "/ingest" || value.startsWith("/auth")) return "/chat";
  return value;
};

const AuthPage = ({
  error,
  nextPath,
}: {
  error: string | undefined;
  nextPath: string | undefined;
}) => {
  const [startingMethod, setStartingMethod] = useState<"anonymous" | "google" | null>(null);
  const [anonymousError, setAnonymousError] = useState(false);
  const callbackURL = safeNextPath(nextPath ?? null);

  const signInWithGoogle = async () => {
    setStartingMethod("google");
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: `/auth?error=access_denied&next=${encodeURIComponent(callbackURL)}`,
    });
    if (result.error !== null) setStartingMethod(null);
  };

  const continueAnonymously = async () => {
    setStartingMethod("anonymous");
    setAnonymousError(false);
    const started = await startAnonymousSession();
    if (!started) {
      setAnonymousError(true);
      setStartingMethod(null);
      return;
    }
    window.location.assign(callbackURL);
  };

  return (
    <main className="flex h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,hsl(var(--muted)),transparent_45%)] px-6">
      <section className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-2xl shadow-black/10">
        <div className="mb-8 space-y-3">
          <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
            Emi HealthFit
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your training history, privately.
          </h1>
          <p className="leading-7 text-muted-foreground">
            Continue as a guest, or sign in with an approved Google account to open your coach,
            workouts, and health data.
          </p>
        </div>
        <Button
          className="h-12 w-full gap-2 rounded-xl"
          onClick={() => void continueAnonymously()}
          disabled={startingMethod !== null}
        >
          {startingMethod === "anonymous" ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <UserRoundIcon className="size-4" />
          )}
          Continue as guest
        </Button>
        {error !== undefined && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
          >
            This Google account is not approved, or sign-in could not be completed. Try an allowed
            account.
          </div>
        )}
        {anonymousError && (
          <p role="alert" className="mt-3 text-center text-sm text-destructive">
            Guest session could not be started. Try again.
          </p>
        )}
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button
          variant="outline"
          className="h-12 w-full gap-2 rounded-xl"
          onClick={() => void signInWithGoogle()}
          disabled={startingMethod !== null}
        >
          {startingMethod === "google" ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <LogInIcon className="size-4" />
          )}
          Continue with Google
        </Button>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Guest access stays in this browser. Signing out loses access to guest data. Calendar
          access is not requested during Google sign-in.
        </p>
      </section>
    </main>
  );
};

export default AuthPage;
