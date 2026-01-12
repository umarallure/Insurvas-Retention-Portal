"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  ChevronDownIcon,
  HeadsetIcon,
  HomeIcon,
  InboxIcon,
  ShieldIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDashboard } from "@/components/dashboard-context";
import { useAccess } from "@/components/access-context";
import { cn } from "@/lib/utils";

export function AppHeaderNav() {
  const router = useRouter();
  const { setIsCommandOpen } = useDashboard();
  const { access } = useAccess();

  const path = router.asPath;

  const isActive = (href: string) => {
    if (href === "/") return path === "/";
    return path === href || path.startsWith(`${href}/`);
  };

  const canSeeAgent = access.isAgent;
  const canSeeManager = access.isManager;
  const canSeeCustomers = access.isManager;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-gradient-to-r from-background via-background/98 to-background backdrop-blur-xl supports-[backdrop-filter]:bg-background/90 shadow-lg shadow-black/5">
      <div className="flex h-16 items-center gap-4 px-4 md:gap-6 md:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center shrink-0">
          <Link 
            href="/" 
            className="flex items-center transition-all duration-200 hover:opacity-80 hover:scale-105"
          >
            <Image
              src="/assets/unlimited-logo.png"
              alt="Unlimited Insurance"
              width={180}
              height={41}
              priority
              className="h-10 w-auto object-contain"
            />
          </Link>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex flex-1 items-center gap-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCommandOpen(true)}
            className="gap-2 h-10 px-4 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-200 ease-in-out rounded-lg"
          >
            <SearchIcon className="h-4 w-4" />
            <span className="hidden md:inline font-medium">Search</span>
          </Button>

          <NavLink
            href="/"
            isActive={isActive("/")}
            icon={<HomeIcon className="h-4 w-4" />}
            label="Dashboard"
          />

          <NavLink
            href="/inbox"
            isActive={isActive("/inbox")}
            icon={<InboxIcon className="h-4 w-4" />}
            label="Inbox"
          />

          {canSeeCustomers && (
            <NavLink
              href="/customers"
              isActive={isActive("/customers")}
              icon={<UsersIcon className="h-4 w-4" />}
              label="Customers"
            />
          )}

          {canSeeAgent && (
            <NavDropdown
              label="Agent"
              icon={<HeadsetIcon className="h-4 w-4" />}
              isActive={isActive("/agent")}
              items={[
                { href: "/agent/assigned-leads", label: "Assigned Leads" },
              ]}
            />
          )}

          {canSeeManager && (
            <NavDropdown
              label="Manager"
              icon={<ShieldIcon className="h-4 w-4" />}
              isActive={isActive("/manager")}
              items={[
                { href: "/manager/retention-daily-deal-flow", label: "Retention Deal Flow" },
                { href: "/manager/assign-lead", label: "Assign Leads" },
                { href: "/manager/fixed-policies", label: "Fixed Policies" },
                { href: "/manager/agent-report-card", label: "Agent Report Card" },
                { href: "/manager/usermanagnent", label: "User Management" },
                { href: "/manager/lead-email-ghl-notes", label: "Lead Email / Notes" },
              ]}
            />
          )}

          <NavDropdown
            label="Settings"
            icon={<SettingsIcon className="h-4 w-4" />}
            isActive={isActive("/settings")}
            items={[
              { href: "/settings", label: "General" },
              { href: "/settings/notifications", label: "Notifications" },
              { href: "/settings/security", label: "Security" },
            ]}
          />
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-3 shrink-0">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  isActive,
  icon,
  label,
}: {
  href: string;
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2.5 h-10 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ease-in-out",
        "text-muted-foreground hover:text-foreground hover:bg-accent/60 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive && "text-foreground bg-accent/80 shadow-sm"
      )}
    >
      {icon}
      <span className="hidden sm:inline whitespace-nowrap">{label}</span>
      {isActive && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-primary rounded-full transition-all duration-200 shadow-sm shadow-primary/50" />
      )}
    </Link>
  );
}

function NavDropdown({
  label,
  icon,
  isActive,
  items,
}: {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  items: Array<{ href: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <div
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="relative"
      >
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "relative flex items-center gap-2.5 h-10 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ease-in-out",
              "text-muted-foreground hover:text-foreground hover:bg-accent/60 hover:shadow-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive && "text-foreground bg-accent/80 shadow-sm",
              open && "text-foreground bg-accent/80 shadow-sm"
            )}
          >
            {icon}
            <span className="hidden sm:inline whitespace-nowrap">{label}</span>
            <ChevronDownIcon 
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200 ease-in-out",
                open && "transform rotate-180"
              )} 
            />
            {(isActive || open) && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-primary rounded-full transition-all duration-200 shadow-sm shadow-primary/50" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="start" 
          className="w-56 mt-1"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {items.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link 
                href={item.href}
                className="flex items-center gap-2 cursor-pointer transition-colors duration-150 rounded-md"
              >
                <span className="font-medium">{item.label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}
