"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC, ReactNode } from "react";
import { MenuIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const tabs = [
  { href: "/chat", label: "Chat" },
  { href: "/upload", label: "Upload" },
  { href: "/workouts", label: "Workouts" },
  { href: "/notes", label: "Notes" },
  { href: "/memory", label: "Memory" },
  { href: "/gen-ui", label: "Sandbox" },
  { href: "/settings", label: "Settings" },
];

export const NavHeader: FC = () => {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  return (
    <header className="relative z-50 flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">Emi HealthFit</h1>
        <p className="text-muted-foreground hidden text-xs sm:inline">Personal gym assistant</p>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {isMobile ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <nav className="mt-6 flex flex-col gap-1">
                {tabs.map((tab) => (
                  <MobileTabButton
                    key={tab.href}
                    href={tab.href}
                    active={pathname.replace(/\/$/, "") === tab.href}
                  >
                    {tab.label}
                  </MobileTabButton>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        ) : (
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <TabButton
                key={tab.href}
                href={tab.href}
                active={pathname.replace(/\/$/, "") === tab.href}
              >
                {tab.label}
              </TabButton>
            ))}
          </nav>
        )}
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

const MobileTabButton = ({
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
    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`}
  >
    {children}
  </Link>
);
