"use client";

import * as React from "react";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuickDispositionButton } from "@/components/agent/quick-disposition-button";

type LeadHeaderProps = {
  name: string;
  carrier: string;
  productType: string;
  center: string;
  dealId: number | null;
  previousAssignedDealId: number | null;
  nextAssignedDealId: number | null;
  assignedDealsLoading: boolean;
  selectedPolicyView: unknown;
  onPreviousLead: () => void;
  onNextLead: () => void;
  onOpenDisposition: () => void;
};

export function LeadHeader({
  name,
  carrier,
  productType,
  center,
  dealId,
  previousAssignedDealId,
  nextAssignedDealId,
  assignedDealsLoading,
  selectedPolicyView,
  onPreviousLead,
  onNextLead,
  onOpenDisposition,
}: LeadHeaderProps) {
  return (
    <CardHeader>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{name}</CardTitle>
          <CardDescription>
            {carrier !== "-" ? carrier : ""}
            {productType !== "-" ? ` • ${productType}` : ""}
            {center !== "-" ? ` • ${center}` : ""}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <QuickDispositionButton onClick={onOpenDisposition} disabled={!selectedPolicyView || !dealId} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={assignedDealsLoading || !dealId || !previousAssignedDealId}
            onClick={onPreviousLead}
          >
            Previous Lead
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={assignedDealsLoading || !dealId || !nextAssignedDealId}
            onClick={onNextLead}
          >
            Next Lead
          </Button>
        </div>
      </div>
    </CardHeader>
  );
}

