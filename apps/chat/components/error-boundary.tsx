"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error === null) {
      return this.props.children;
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangleIcon className="text-destructive size-10" />
        <div>
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">{this.state.error.message}</p>
        </div>
        <Button onClick={this.handleReset} variant="outline" className="gap-2">
          <RefreshCwIcon className="size-4" />
          Try again
        </Button>
      </div>
    );
  }
}
