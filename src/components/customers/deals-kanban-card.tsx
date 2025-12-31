"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { Badge } from "@/components/ui/badge";
import { getDealLabelStyle, getDealTagLabelFromGhlStage } from "@/lib/monday-deal-category-tags";

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

export function DealsKanbanCard({ deal }: { deal: DealsKanbanRow }) {
  const router = useRouter();

  const tagLabel = React.useMemo(() => {
    return getDealTagLabelFromGhlStage(deal.ghl_stage);
  }, [deal.ghl_stage]);

  const tagStyle = React.useMemo(() => {
    return getDealLabelStyle(tagLabel);
  }, [tagLabel]);

  const href = React.useMemo(() => {
    return `/customers/lead-detail?${encodeURIComponent(String(deal.id))}`;
  }, [deal.id]);

  return (
    <button
      type="button"
      className="text-left rounded-xl border bg-card p-3 shadow-sm transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary w-full h-[168px] flex flex-col"
      onClick={() => {
        void router.push(href);
      }}
    >
      <div className="min-w-0">
        <div
          className="text-sm font-semibold text-foreground truncate"
          title={(deal.ghl_name ?? deal.deal_name ?? undefined) as string | undefined}
        >
          {deal.ghl_name ?? deal.deal_name ?? "—"}
        </div>

        {tagLabel ? (
          <div className="mt-2">
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-2 rounded-full"
              style={
                tagStyle
                  ? {
                      backgroundColor: tagStyle.bg,
                      borderColor: tagStyle.border,
                      color: tagStyle.text,
                    }
                  : undefined
              }
            >
              {tagLabel}
            </Badge>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs flex-1 min-h-0">
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
