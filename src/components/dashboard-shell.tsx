"use client";

import { ReactNode, useEffect, useRef } from "react";

import { AppHeaderNav } from "@/components/app-header-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BellIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

import { useDashboard } from "@/components/dashboard-context";
import { cn } from "@/lib/utils";

function DashboardShellInner({ children }: { children: ReactNode }) {
  const { setIsNotificationsOpen, dialerOpen } = useDashboard();

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeaderNav />
      
      <div className="flex flex-1 flex-col">
        <div
          className={cn(
            "flex flex-1 flex-col transition-[padding-right] duration-200",
            dialerOpen ? "pr-[420px]" : "pr-0",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return <DashboardShellInner>{children}</DashboardShellInner>;
}
