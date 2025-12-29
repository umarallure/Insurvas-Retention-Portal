"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { Badge } from "@/components/ui/badge";

export type DealsKanbanRow = {
  id: number;
  monday_item_id: string | null;
  policy_number: string | null;
  carrier: string | null;
  policy_status: string | null;
  ghl_name: string | null;
  ghl_stage: string | null;
  phone_number: string | null;
  call_center: string | null;
  deal_name: string | null;
};

function statusBadge(status: string | null) {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "won" || s === "closed" || s === "issued" || s === "approved"
      ? "bg-green-500/10 text-green-600 border-green-500/20"
      : s === "lost" || s === "canceled" || s === "inactive"
        ? "bg-red-500/10 text-red-600 border-red-500/20"
        : "bg-amber-500/10 text-amber-600 border-amber-500/20";

  return (
    <Badge variant="outline" className={`font-medium inline-flex max-w-[220px] overflow-hidden ${cls}`}>
      <span className="truncate">{status ?? "—"}</span>
    </Badge>
  );
}

export function DealsKanbanCard({ deal }: { deal: DealsKanbanRow }) {
  const router = useRouter();

  const href = React.useMemo(() => {
    return `/customers/lead-detail?${encodeURIComponent(String(deal.id))}`;
  }, [deal.id]);

  return (
    <button
      type="button"
      className="text-left rounded-xl border bg-card p-3 shadow-sm transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary w-full h-[172px] flex flex-col"
      onClick={() => {
        void router.push(href);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate" title={deal.policy_number ?? undefined}>
            {deal.policy_number ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground truncate" title={deal.carrier ?? undefined}>
            {deal.carrier ?? "—"}
          </div>
        </div>
        <div className="shrink-0">{statusBadge(deal.policy_status)}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="text-muted-foreground">GHL Name</div>
        <div className="font-medium text-foreground text-right truncate" title={deal.ghl_name ?? undefined}>
          {deal.ghl_name ?? "—"}
        </div>

        <div className="text-muted-foreground">Phone</div>
        <div className="font-medium text-foreground text-right tabular-nums truncate" title={deal.phone_number ?? undefined}>
          {deal.phone_number ?? "—"}
        </div>

        <div className="text-muted-foreground">Center</div>
        <div className="text-right">
          <Badge variant="secondary" className="bg-secondary/50 max-w-full">
            <span className="truncate block">{deal.call_center ?? "—"}</span>
          </Badge>
        </div>

        <div className="text-muted-foreground">GHL Stage</div>
        <div className="font-medium text-foreground text-right truncate" title={deal.ghl_stage ?? undefined}>
          {deal.ghl_stage ?? "—"}
        </div>
      </div>
    </button>
  );
}
