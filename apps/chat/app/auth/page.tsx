"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoaderCircleIcon, LogInIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "../auth-client";

const safeNextPath = (value: string | null): string =>
  value !== null && value.startsWith("/") && !value.startsWith("//") ? value : "/chat";

const AuthPage = () => {
  const searchParams = useSearchParams();
  const [isStarting, setIsStarting] = useState(false);
  const error = searchParams.get("error");
  const callbackURL = safeNextPath(searchParams.get("next"));

  const signIn = async () => {
    setIsStarting(true);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: `/auth?error=access_denied&next=${encodeURIComponent(callbackURL)}`,
    });
    if (result.error !== null) setIsStarting(false);
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
            Sign in with an approved Google account to open your coach, workouts, and health data.
          </p>
        </div>
        {error !== null && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
          >
            This Google account is not approved, or sign-in could not be completed. Try an allowed
            account.
          </div>
        )}
        <Button
          className="h-12 w-full gap-2 rounded-xl"
          onClick={() => void signIn()}
          disabled={isStarting}
        >
          {isStarting ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <LogInIcon className="size-4" />
          )}
          Continue with Google
        </Button>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Calendar access is not requested during sign-in.
        </p>
      </section>
    </main>
  );
};

export default AuthPage;
