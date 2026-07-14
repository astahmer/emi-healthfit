"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC, ReactNode } from "react";
import {
  BrainIcon,
  DumbbellIcon,
  FlaskConicalIcon,
  MenuIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  SettingsIcon,
  UploadIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const tabs = [
  { href: "/chat", label: "Chat", icon: MessageSquareIcon, description: "Ask your coach" },
  { href: "/upload", label: "Upload", icon: UploadIcon, description: "Import health data" },
  { href: "/workouts", label: "Workouts", icon: DumbbellIcon, description: "Browse sessions" },
  { href: "/notes", label: "Notes", icon: NotebookPenIcon, description: "Gym journal" },
  { href: "/memory", label: "Memory", icon: BrainIcon, description: "Saved snippets" },
  ...(process.env.NODE_ENV === "development"
    ? [{ href: "/gen-ui", label: "Sandbox", icon: FlaskConicalIcon, description: "UI playground" }]
    : []),
  { href: "/settings", label: "Settings", icon: SettingsIcon, description: "Preferences" },
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
                    icon={tab.icon}
                    description={tab.description}
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
                icon={tab.icon}
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
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ElementType;
  children: ReactNode;
}) => (
  <Link
    href={href}
    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`}
  >
    <Icon className="size-4" />
    {children}
  </Link>
);

const MobileTabButton = ({
  href,
  active,
  icon: Icon,
  description,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ElementType;
  description: string;
  children: ReactNode;
}) => (
  <Link
    href={href}
    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`}
  >
    <Icon className="size-5 shrink-0" />
    <div className="flex flex-col items-start">
      <span>{children}</span>
      <span className="text-xs font-normal opacity-70">{description}</span>
    </div>
  </Link>
);
