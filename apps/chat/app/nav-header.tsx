import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { FC, ReactNode } from "react";
import {
  BrainIcon,
  ChartNoAxesCombinedIcon,
  DumbbellIcon,
  FlaskConicalIcon,
  MenuIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  SettingsIcon,
  UploadIcon,
  LogOutIcon,
  UserRoundIcon,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "./auth-client";
import { isAnonymousAccountEmail } from "./anonymous-auth";
import { clearSessionCache } from "./session-cache";

const tabs = [
  { href: "/chat", label: "Chat", icon: MessageSquareIcon, description: "Ask your coach" },
  { href: "/upload", label: "Upload", icon: UploadIcon, description: "Import health data" },
  { href: "/workouts", label: "Workouts", icon: DumbbellIcon, description: "Browse sessions" },
  {
    href: "/summary",
    label: "Trends",
    icon: ChartNoAxesCombinedIcon,
    description: "Health analytics",
  },
  { href: "/notes", label: "Notes", icon: NotebookPenIcon, description: "Gym journal" },
  { href: "/memory", label: "Memory", icon: BrainIcon, description: "Saved snippets" },
  ...(import.meta.env.DEV
    ? [{ href: "/gen-ui", label: "Sandbox", icon: FlaskConicalIcon, description: "UI playground" }]
    : []),
  { href: "/settings", label: "Settings", icon: SettingsIcon, description: "Preferences" },
];

export const NavHeader: FC = () => {
  const pathname = useLocation({ select: (location) => location.pathname });
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return null;

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b bg-background/70 px-3 backdrop-blur-xl md:bg-background md:px-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">Emi HealthFit</h1>
        <p className="text-muted-foreground hidden text-xs sm:inline">Personal gym assistant</p>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <nav className="hidden gap-1 md:flex">
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
        <div className="md:hidden">
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
        </div>
        <AccountMenu />
      </div>
    </header>
  );
};

const AccountMenu = () => {
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    await clearSessionCache();
    await navigate({ to: "/auth", replace: true });
  };

  if (session.data === null) return null;
  const isAnonymous = isAnonymousAccountEmail(session.data.user.email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open account menu">
          <UserRoundIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate">{session.data.user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {isAnonymous ? "Anonymous session" : session.data.user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    to={href}
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
    to={href}
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
