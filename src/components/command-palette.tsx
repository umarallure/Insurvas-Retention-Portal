"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

import { useDashboard } from "@/components/dashboard-context";

import { GithubIcon } from "lucide-react";

export function CommandPalette() {
  const router = useRouter();
  const { isCommandOpen, setIsCommandOpen } = useDashboard();

  const openAndNavigate = (to: string) => {
    setIsCommandOpen(false);
    router.push(to);
  };

  const pageSourceUrl = React.useMemo(() => {
    const path = router.pathname === "/" ? "/index" : router.pathname;
    return `https://github.com/nuxt-ui-templates/dashboard-vue/blob/main/src/pages${path}.vue`;
  }, [router.pathname]);

  return (
    <Dialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => openAndNavigate("/")}>Dashboard</CommandItem>
              <CommandItem onSelect={() => openAndNavigate("/inbox")}>Inbox</CommandItem>
              <CommandItem onSelect={() => openAndNavigate("/customers")}>Customers</CommandItem>
              <CommandItem onSelect={() => openAndNavigate("/agent/assigned-leads")}>Agent</CommandItem>
              <CommandItem onSelect={() => openAndNavigate("/manager/retention-daily-deal-flow")}>Manager</CommandItem>
              <CommandItem onSelect={() => openAndNavigate("/settings")}>Settings</CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Code">
              <CommandItem asChild>
                <Link href={pageSourceUrl} target="_blank" rel="noreferrer">
                  <GithubIcon className="mr-2 size-4" />
                  View page source
                </Link>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
