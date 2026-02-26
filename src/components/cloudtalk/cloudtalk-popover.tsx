"use client";

import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useCloudTalk } from "@/components/cloudtalk/use-cloudtalk";
import { useDashboard } from "@/components/dashboard-context";

export function CloudTalkPopover({ open }: { open: boolean }) {
  const { ready, loggedIn, isCalling, lastError, lastStatus, dialNumber } = useCloudTalk();
  const { currentLeadPhone } = useDashboard();
  const previousPhoneRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && currentLeadPhone && currentLeadPhone !== "-") {
      previousPhoneRef.current = currentLeadPhone;
    }
  }, [currentLeadPhone, open]);

  return (
    <div className="w-[380px] overflow-hidden rounded-md border bg-background shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b bg-background px-4 pb-3 pt-3">
        <div className="flex flex-1 items-center justify-between">
          <div className="text-sm font-semibold">VICIdial Dialer</div>
          <Badge variant="outline" className="text-[10px]">
            {ready ? (loggedIn ? "Ready" : "Not ready") : "Loading..."}
          </Badge>
        </div>
      </div>

      {lastError ? (
        <div className="border-b px-4 py-2 text-xs text-destructive">{lastError}</div>
      ) : null}

      {lastStatus ? (
        <div className="border-b px-4 py-2 text-xs text-green-600 dark:text-green-400">{lastStatus}</div>
      ) : null}

      <div className="border-b bg-background px-4 py-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Current lead phone</div>
            <div className="truncate text-sm font-medium text-foreground">
              {currentLeadPhone && currentLeadPhone !== "-" ? currentLeadPhone : "No phone on current lead"}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="text-xs"
            disabled={!currentLeadPhone || currentLeadPhone === "-" || isCalling}
            onClick={() => {
              if (!currentLeadPhone) return;
              void dialNumber(currentLeadPhone);
            }}
          >
            {isCalling ? "Calling..." : "Call lead"}
          </Button>
        </div>
      </div>

      <div className="bg-muted/10 p-4">
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Click &quot;Call lead&quot; to initiate a call through VICIdial.</p>
          <p className="text-[10px]">
            The agent must be available in VICIdial for calls to connect.
          </p>
        </div>
      </div>
    </div>
  );
}
