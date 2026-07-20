import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { FC, ReactNode } from "react";
import { MenuIcon, LogOutIcon, UserRoundIcon } from "lucide-react";
import { useCoreWebContributions } from "@emi/core-web";
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

export const NavHeader: FC = () => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { nav } = useCoreWebContributions();
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
          {nav.map((tab) => (
            <TabButton
              key={tab.id}
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
                {nav.map((tab) => (
                  <MobileTabButton
                    key={tab.id}
                    href={tab.href}
                    active={pathname.replace(/\/$/, "") === tab.href}
                    icon={tab.icon}
                    description={tab.description ?? ""}
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
  icon?: React.ElementType;
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
    {Icon !== undefined && <Icon className="size-4" />}
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
  icon?: React.ElementType;
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
    {Icon !== undefined && <Icon className="size-5 shrink-0" />}
    <div className="flex flex-col items-start">
      <span>{children}</span>
      <span className="text-xs font-normal opacity-70">{description}</span>
    </div>
  </Link>
);
