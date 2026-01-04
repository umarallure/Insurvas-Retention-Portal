"use client";

import { ReactNode, useEffect, useRef } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BellIcon } from "lucide-react";

import { useDashboard } from "@/components/dashboard-context";
import { cn } from "@/lib/utils";

function DashboardShellInner({ children }: { children: ReactNode }) {
  const { setIsNotificationsOpen, dialerOpen } = useDashboard();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const previousDialerOpenRef = useRef(dialerOpen);

  useEffect(() => {
    if (!dialerOpen || !sidebarOpen) return;
    setSidebarOpen(false);
  }, [dialerOpen, sidebarOpen, setSidebarOpen]);

  useEffect(() => {
    const wasOpen = previousDialerOpenRef.current;
    previousDialerOpenRef.current = dialerOpen;
    if (!wasOpen || dialerOpen) return;

    setSidebarOpen(true);
  }, [dialerOpen, setSidebarOpen]);

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <div className="flex min-h-svh flex-col">
          <header className="flex h-14 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">Dashboard</div>

            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsNotificationsOpen(true)}
                    className="relative"
                  >
                    <BellIcon className="size-4" />
                    <Badge
                      variant="destructive"
                      className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]"
                    >
                      4
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notifications (N)</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <div
            className={cn(
              "flex flex-1 flex-col transition-[padding-right] duration-200",
              dialerOpen ? "pr-[420px]" : "pr-0",
            )}
          >
            {children}
          </div>
        </div>
      </SidebarInset>
    </>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <DashboardShellInner>{children}</DashboardShellInner>
    </SidebarProvider>
  );
}
