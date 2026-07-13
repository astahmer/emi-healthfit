"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC, ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

const tabs = [
  { href: "/chat", label: "Chat" },
  { href: "/upload", label: "Upload" },
  { href: "/workouts", label: "Workouts" },
  { href: "/settings", label: "Settings" },
];

export const NavHeader: FC = () => {
  const pathname = usePathname();

  return (
    <header className="relative z-50 flex items-center justify-between border-b bg-background px-4 py-3">
      <div>
        <h1 className="text-lg font-semibold">Emi HealthFit</h1>
        <p className="text-muted-foreground text-xs">Personal gym assistant</p>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <TabButton key={tab.href} href={tab.href} active={pathname === tab.href}>
              {tab.label}
            </TabButton>
          ))}
        </nav>
      </div>
    </header>
  );
};

const TabButton = ({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) => (
  <Link
    href={href}
    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`}
  >
    {children}
  </Link>
);
