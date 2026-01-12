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
    return `/customers/lead-detail?id=${encodeURIComponent(String(deal.id))}`;
  }, [deal.id]);

  return (
    <button
      type="button"
      className="text-left rounded-lg border bg-card p-4 shadow-sm transition-all duration-200 ease-out hover:shadow-xl hover:border-primary/50 hover:scale-[1.05] hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary w-full flex flex-col group transform origin-center"
      onClick={() => {
        void router.push(href);
      }}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-3">
        <div
          className="text-xl font-bold text-foreground truncate group-hover:text-primary transition-colors"
          title={(deal.ghl_name ?? deal.deal_name ?? undefined) as string | undefined}
        >
          {deal.ghl_name ?? deal.deal_name ?? "—"}
        </div>

        {tagLabel ? (
            <Badge
              variant="outline"
            className="text-sm h-7 px-3 rounded-full font-semibold w-fit"
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
        ) : null}

        <div className="mt-auto space-y-2 text-base">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground font-semibold">Phone</span>
            <span className="font-bold text-foreground tabular-nums truncate text-right" title={deal.phone_number ?? undefined}>
              {deal.phone_number ?? "—"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground font-semibold">Center</span>
            <Badge variant="secondary" className="bg-secondary/50 text-sm h-6 px-2.5 font-medium">
              <span className="truncate max-w-[120px] block">{deal.call_center ?? "—"}</span>
            </Badge>
          </div>

          <div className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground font-semibold">GHL Stage</span>
            <span className="font-semibold text-foreground text-right truncate text-sm leading-snug" title={deal.ghl_stage ?? undefined}>
              {deal.ghl_stage ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
