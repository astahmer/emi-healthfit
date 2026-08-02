import type { ReactNode } from "react";

export declare const ChatApp: (props?: {
  readonly children?: ReactNode;
  readonly slots?: Record<string, ReactNode>;
}) => ReactNode;
export declare const ChatShell: (props: { readonly children?: ReactNode }) => ReactNode;
