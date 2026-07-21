"use client";

import type { FC, ReactNode } from "react";
import { ToolResultContent as CoreToolResultContent } from "@emi/core/web";
import { GenUIRenderer } from "@emi/flavor-healthfit/web";
import { ErrorBoundary } from "../error-boundary";
import { cn } from "@/lib/utils";

export {
  ExerciseProgressToolRenderer,
  ExerciseProgressView,
  RecoveryCard,
  RecoveryToolRenderer,
  WorkoutHistoryTable,
  WorkoutHistoryToolRenderer,
} from "@emi/flavor-healthfit/web";

const FallbackResult: FC<{ value: unknown; className?: string }> = ({ value, className }) => (
  <pre
    className={cn(
      "bg-muted/50 text-foreground/90 mt-1 rounded-md p-2.5 text-xs whitespace-pre-wrap",
      className,
    )}
  >
    {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
  </pre>
);

export interface ToolResultContentProps {
  toolName: string;
  result?: unknown;
  className?: string;
}

export const ToolResultContent = ({
  toolName,
  result,
  className,
}: ToolResultContentProps): ReactNode => (
  <CoreToolResultContent
    toolName={toolName}
    result={result}
    className={className}
    renderComponent={(spec) => (
      <ErrorBoundary fallback={<FallbackResult value={result} className={className} />}>
        <GenUIRenderer spec={spec} />
      </ErrorBoundary>
    )}
  />
);
