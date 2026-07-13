"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC, ReactNode } from "react";

const tabs = [
  { href: "/chat", label: "Chat" },
  { href: "/upload", label: "Upload" },
  { href: "/workouts", label: "Workouts" },
  { href: "/settings", label: "Settings" },
];

export const NavHeader: FC = () => {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div>
        <h1 className="text-lg font-semibold">Emi HealthFit</h1>
        <p className="text-muted-foreground text-xs">Personal gym assistant</p>
      </div>
      <nav className="flex gap-1">
        {tabs.map((tab) => (
          <TabButton key={tab.href} href={tab.href} active={pathname === tab.href}>
            {tab.label}
          </TabButton>
        ))}
      </nav>
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
