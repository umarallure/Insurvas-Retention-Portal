"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  HeadsetIcon,
  HomeIcon,
  InboxIcon,
  ShieldIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { useDashboard } from "@/components/dashboard-context";

export function AppSidebar() {
  const router = useRouter();
  const { setIsCommandOpen } = useDashboard();

  const path = router.asPath;

  const isActive = (href: string) => {
    if (href === "/") return path === "/";
    return path === href || path.startsWith(`${href}/`);
  };

  const onAgent = path === "/agent" || path.startsWith("/agent/");
  const onManager = path === "/manager" || path.startsWith("/manager/");
  const onSettings = path === "/settings" || path.startsWith("/settings/");

  const [agentOpen, setAgentOpen] = React.useState(() => onAgent);
  const [managerOpen, setManagerOpen] = React.useState(() => onManager);
  const [settingsOpen, setSettingsOpen] = React.useState(() => onSettings);

  React.useEffect(() => {
    if (onAgent) {
      setAgentOpen(true);
    }
    if (onManager) {
      setManagerOpen(true);
    }
    if (onSettings) {
      setSettingsOpen(true);
    }
  }, [onAgent, onManager, onSettings]);

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="bg-sidebar/70">
      <SidebarHeader>
        <div className="flex items-center justify-center rounded-lg">
          <Image
            src="/assets/unlimited-logo.png"
            alt="Unlimited"
            width={360}
            height={82}
            priority
            className="h-14 w-full object-contain"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Search"
              onClick={() => setIsCommandOpen(true)}
            >
              <SearchIcon />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/")} tooltip="Dashboard">
              <Link href="/">
                <HomeIcon />
                <span>Dashboard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/inbox")} tooltip="Inbox">
              <Link href="/inbox">
                <InboxIcon />
                <span>Inbox</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/customers")} tooltip="Customers">
              <Link href="/customers">
                <UsersIcon />
                <span>Customers</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/agent")} tooltip="Agent">
              <Link href="/agent/assigned-leads">
                <HeadsetIcon />
                <span>Agent</span>
              </Link>
            </SidebarMenuButton>

            <SidebarMenuAction
              aria-label={agentOpen ? "Collapse agent" : "Expand agent"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setAgentOpen((v) => !v);
              }}
              className="rounded-md"
            >
              {agentOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </SidebarMenuAction>

            {agentOpen ? (
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={isActive("/agent/assigned-leads")}>
                    <Link href="/agent/assigned-leads">
                      <span>Assigned Leads</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActive("/agent/assigned-lead-details")}
                  >
                    <Link href="/agent/assigned-lead-details">
                      <span>Lead Details</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={isActive("/agent/call-update")}>
                    <Link href="/agent/call-update">
                      <span>Call Update</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/manager")} tooltip="Manager">
              <Link href="/manager/retention-daily-deal-flow">
                <ShieldIcon />
                <span>Manager</span>
              </Link>
            </SidebarMenuButton>

            <SidebarMenuAction
              aria-label={managerOpen ? "Collapse manager" : "Expand manager"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setManagerOpen((v) => !v);
              }}
              className="rounded-md"
            >
              {managerOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </SidebarMenuAction>

            {managerOpen ? (
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActive("/manager/retention-daily-deal-flow")}
                  >
                    <Link href="/manager/retention-daily-deal-flow">
                      <span>Retention Deal Flow</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={isActive("/manager/agent-report-card")}>
                    <Link href="/manager/agent-report-card">
                      <span>Agent Report Card</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={isActive("/manager/usermanagnent")}>
                    <Link href="/manager/usermanagnent">
                      <span>User Management</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={isActive("/manager/lead-email-ghl-notes")}>
                    <Link href="/manager/lead-email-ghl-notes">
                      <span>Lead Email / Notes</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings">
              <Link href="/settings">
                <SettingsIcon />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>

            <SidebarMenuAction
              aria-label={settingsOpen ? "Collapse settings" : "Expand settings"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSettingsOpen((v) => !v);
              }}
              className="rounded-md"
            >
              {settingsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </SidebarMenuAction>

            {settingsOpen ? (
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={path === "/settings"}>
                    <Link href="/settings">
                      <span>General</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={isActive("/settings/notifications")}>
                    <Link href="/settings/notifications">
                      <span>Notifications</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={isActive("/settings/security")}>
                    <Link href="/settings/security">
                      <span>Security</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
