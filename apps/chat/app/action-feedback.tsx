"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type FeedbackKind = "error" | "info" | "success";

interface Feedback {
  kind: FeedbackKind;
  message: string;
}

interface ActionFeedbackContextValue {
  show: (feedback: Feedback) => void;
}

const ActionFeedbackContext = createContext<ActionFeedbackContextValue>({ show: () => undefined });

export const ActionFeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const value = useMemo<ActionFeedbackContextValue>(() => ({ show: setFeedback }), []);

  useEffect(() => {
    if (feedback === null) return;
    const timeout = window.setTimeout(() => setFeedback(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  return (
    <ActionFeedbackContext.Provider value={value}>
      {children}
      {feedback !== null && (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          aria-live={feedback.kind === "error" ? "assertive" : "polite"}
          className={`fixed right-4 bottom-4 z-[100] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
            feedback.kind === "error"
              ? "border-destructive/30 bg-destructive text-destructive-foreground"
              : "bg-popover text-popover-foreground"
          }`}
        >
          {feedback.message}
        </div>
      )}
    </ActionFeedbackContext.Provider>
  );
};

export const useActionFeedback = (): ActionFeedbackContextValue =>
  useContext(ActionFeedbackContext);
