"use client";

import * as React from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";

type PolicyStatusAlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPolicyKey: string | null;
  selectedPolicyView: { policyNumber?: string | null; callCenter?: string | null } | null;
  lead: { id?: string } | null;
  selectedDeal: { id?: number } | null;
  retentionAgent: string;
  onSwitchToFixedPayment: () => void;
  onSwitchToNewSale: () => void;
};

export function PolicyStatusAlertDialog({
  open,
  onOpenChange,
  selectedPolicyKey,
  selectedPolicyView,
  lead,
  selectedDeal,
  retentionAgent,
  onSwitchToFixedPayment,
  onSwitchToNewSale,
}: PolicyStatusAlertDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Policy Status Alert
          </DialogTitle>
        </DialogHeader>

        <div className="text-muted-foreground text-lg leading-relaxed">
          This is not a pending policy. Either select a different workflow or policy.
        </div>

        <div className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button variant="secondary" className="h-12" onClick={onSwitchToFixedPayment}>
              Switch to Fix Payment
            </Button>

            <Button variant="secondary" className="h-12" onClick={onSwitchToNewSale}>
              Switch to New Sale
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full h-12"
            onClick={() => {
              onOpenChange(false);
              if (selectedPolicyView && lead && typeof lead.id === "string" && selectedPolicyView.policyNumber) {
                const raw = (selectedDeal ?? null) as unknown as Record<string, unknown> | null;
                const dealIdForRoute = raw && typeof raw["id"] === "number" ? (raw["id"] as number) : null;
                void router.push(
                  `/agent/call-update?leadId=${encodeURIComponent(lead.id)}&policyNumber=${encodeURIComponent(
                    selectedPolicyView.policyNumber,
                  )}&dealId=${encodeURIComponent(String(dealIdForRoute ?? ""))}&callCenter=${encodeURIComponent(
                    selectedPolicyView.callCenter ?? "",
                  )}&retentionAgent=${encodeURIComponent(retentionAgent)}&retentionType=carrier_requirements`,
                );
              }
            }}
          >
            Update Call Result
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

