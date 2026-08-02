import type { ReactNode } from "react";

export declare const ChatApp: (props?: {
  readonly appName?: string;
  readonly description?: string;
  readonly version?: string;
  readonly releaseNotes?: ReadonlyArray<string>;
  readonly children?: ReactNode;
  readonly slots?: Record<string, ReactNode>;
}) => ReactNode;
export declare const ChatShell: (props: { readonly children?: ReactNode }) => ReactNode;
