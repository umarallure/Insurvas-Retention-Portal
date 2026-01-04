"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { PhoneIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AircallPopover } from "@/components/aircall/aircall-popover";
import { useOptionalSidebar } from "@/components/ui/sidebar";
import { useDashboard } from "@/components/dashboard-context";

export function AircallWidget() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const sidebar = useOptionalSidebar();
  const { setDialerOpen } = useDashboard();

  const isLeadDetailsPage = router.pathname === "/agent/assigned-lead-details";

  React.useEffect(() => {
    if (!isLeadDetailsPage) return;
    setOpen(true);
    setDialerOpen(true);
    if (sidebar?.setOpen) sidebar.setOpen(false);
  }, [isLeadDetailsPage, setDialerOpen, sidebar]);

  return (
    <div className="fixed bottom-6 right-6 z-60">
      <Popover open={open}>
        <PopoverTrigger asChild>
          <Button
            size="icon-lg"
            className="rounded-full shadow-lg"
            aria-label={open ? "Close dialer" : "Open dialer"}
            disabled={isLeadDetailsPage && open}
            onClick={() => {
              if (isLeadDetailsPage && open) return;
              setOpen((v) => {
                const next = !v;
                setDialerOpen(next);
                if (next && sidebar?.setOpen) {
                  // Auto-close the app sidebar so there is room for the dialer.
                  sidebar.setOpen(false);
                }
                return next;
              });
            }}
          >
            {open ? <XIcon className="size-5" /> : <PhoneIcon className="size-5" />}
          </Button>
        </PopoverTrigger>

        <PopoverContent side="top" align="end" sideOffset={12} className="w-[380px] p-0">
          <AircallPopover open={open} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
