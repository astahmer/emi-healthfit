import { Fragment } from "react";
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
          {nav.map((item, index) => {
            const previous = index > 0 ? nav[index - 1] : undefined;
            const sectionChanged =
              previous !== undefined &&
              item.section !== undefined &&
              previous.section !== undefined &&
              previous.section !== item.section;
            return (
              <Fragment key={item.id}>
                {sectionChanged && (
                  <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
                )}
                {renderItem(item, item.href === activePath)}
              </Fragment>
            );
          })}
        </nav>
        {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
};
