import type { ReactNode } from "react";
import { useCoreWebContributions, type NavContribution } from "./contributions";

export interface ChatShellProps {
  activePath?: string;
  renderNavItem?: (item: NavContribution, isActive: boolean) => ReactNode;
  actions?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
}

const defaultRenderNavItem = (item: NavContribution, isActive: boolean): ReactNode => (
  <a key={item.id} href={item.href} aria-current={isActive ? "page" : undefined}>
    {item.label}
  </a>
);

export const ChatShell = ({
  activePath,
  renderNavItem,
  actions,
  title,
  children,
}: ChatShellProps) => {
  const { nav } = useCoreWebContributions();
  const renderItem = renderNavItem ?? defaultRenderNavItem;
  return (
    <div className="flex h-dvh flex-col" data-testid="chat-shell">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        {title !== undefined && <div className="font-semibold">{title}</div>}
        <nav aria-label="Primary" className="flex items-center gap-2">
          {nav.map((item) => renderItem(item, item.href === activePath))}
        </nav>
        {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
};
