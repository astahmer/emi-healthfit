import type { ReactNode } from "react";
import { ConnectedComposer, ConnectedSidebar, ConnectedThread, Sidebar } from "../index.tsx";

export const ChatShell = ({ children }: { readonly children?: ReactNode }) => (
  <div data-testid="chat-shell">{children}</div>
);

export const ChatApp = ({
  children,
  slots,
}: {
  readonly children?: ReactNode;
  readonly slots?: Record<string, ReactNode>;
} = {}) => (
  <div className="emi-chat-app">
    {slots?.sidebar ?? (
      <Sidebar>
        <ConnectedSidebar />
      </Sidebar>
    )}
    <main aria-label="Chat">
      {slots?.header}
      <ChatShell>
        {children ?? <ConnectedThread />}
        {slots?.composer ?? <ConnectedComposer />}
      </ChatShell>
      {slots?.footer}
    </main>
  </div>
);
