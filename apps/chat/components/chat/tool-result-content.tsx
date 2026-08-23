"use client";

import type { ReactNode } from "react";
import { FallbackResult, ToolResultContent as CoreToolResultContent } from "@emi/core/web";
import { GenUIRenderer } from "@emi/flavor-healthfit/web";
import { ErrorBoundary } from "../error-boundary";

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
