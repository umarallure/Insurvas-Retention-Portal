"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import type { MondayComDeal } from "@/types";
import { supabase } from "@/lib/supabase";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDownIcon, ChevronRightIcon, EyeIcon } from "lucide-react";

export type DealGroup = {
  id: string;
  title: string;
  queryTitle?: string;
  queryTitles?: string[];
  queryTitleIlike?: string[];
  queryStage?: string;
  queryStages?: string[];
  queryStageIlike?: string[];
  excludeTitleIlike?: string[];
  excludeStageIlike?: string[];
  color: string;
};

type DealRow = Pick<
  MondayComDeal,
  | "id"
  | "monday_item_id"
  | "policy_number"
  | "carrier"
  | "policy_status"
  | "ghl_name"
  | "ghl_stage"
  | "phone_number"
  | "call_center"
  | "deal_name"
>;

function statusBadge(status: string | null) {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "won" || s === "closed" || s === "issued" || s === "approved"
      ? "bg-green-500/10 text-green-600 border-green-500/20"
      : s === "lost" || s === "canceled" || s === "inactive"
        ? "bg-red-500/10 text-red-600 border-red-500/20"
        : "bg-amber-500/10 text-amber-600 border-amber-500/20";

  return (
    <Badge variant="outline" className={`font-medium inline-flex max-w-[180px] overflow-hidden ${cls}`}>
      <span className="truncate">{status ?? "—"}</span>
    </Badge>
  );
}

export function GroupedDealsGroup({
  group,
  search,
  pageSize,
}: {
  group: DealGroup;
  search: string;
  pageSize: number;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<DealRow[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    setPage(1);
  }, [search, group.title]);

  const fetchData = React.useCallback(async () => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;

    const titles = (group.queryTitles && group.queryTitles.length > 0
      ? group.queryTitles
      : [group.queryTitle ?? group.title]
    ).filter(Boolean);

    const ilikePatterns = (group.queryTitleIlike ?? []).filter(Boolean);

    const stages = (group.queryStages && group.queryStages.length > 0
      ? group.queryStages
      : group.queryStage
        ? [group.queryStage]
        : []
    ).filter(Boolean);

    const stageIlikePatterns = (group.queryStageIlike ?? []).filter(Boolean);
    const excludeTitleIlike = (group.excludeTitleIlike ?? []).filter(Boolean);
    const excludeStageIlike = (group.excludeStageIlike ?? []).filter(Boolean);

    setLoading(true);
    try {
      let q = supabase
        .from("monday_com_deals")
        .select(
          "id,monday_item_id,policy_number,carrier,policy_status,ghl_name,ghl_stage,phone_number,call_center,deal_name",
          { count: "exact" }
        )
        .eq("is_active", true)
        .order("last_updated", { ascending: false, nullsFirst: false })
        .range(from, to);

      const includeOr: string[] = [];

      for (const p of ilikePatterns) includeOr.push(`group_title.ilike.${p}`);
      for (const t of titles) includeOr.push(`group_title.eq.${t}`);

      for (const p of stageIlikePatterns) includeOr.push(`ghl_stage.ilike.${p}`);
      for (const s of stages) includeOr.push(`ghl_stage.ilike.%${s.replace(/,/g, "")}%`);

      // If any stage-based filter is provided, use a single OR-expression across all include rules.
      // Otherwise, fall back to the exact group_title filter for maximum index friendliness.
      const shouldUseOr = stageIlikePatterns.length > 0 || stages.length > 0 || ilikePatterns.length > 0;

      if (shouldUseOr) {
        q = q.or(includeOr.join(","));
      } else {
        q = q.in("group_title", titles);
      }

      for (const p of excludeTitleIlike) {
        q = q.not("group_title", "ilike", p);
      }

      for (const p of excludeStageIlike) {
        q = q.not("ghl_stage", "ilike", p);
      }

      const trimmed = search.trim();
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        q = q.or(
          `policy_number.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,deal_name.ilike.%${escaped}%`
        );
      }

      const { data, error, count: total } = await q;

      if (error) {
        console.error("[grouped-deals-group] fetch error", error);
        setRows([]);
        setHasMore(false);
        setCount(null);
        return;
      }

      const fetched = ((data ?? []) as DealRow[]) ?? [];
      setHasMore(fetched.length > pageSize);
      setRows(fetched.slice(0, pageSize));
      setCount(typeof total === "number" ? total : null);
    } finally {
      setLoading(false);
    }
  }, [
    group.excludeStageIlike,
    group.excludeTitleIlike,
    group.queryStage,
    group.queryStageIlike,
    group.queryStages,
    group.queryTitle,
    group.queryTitleIlike,
    group.queryTitles,
    group.title,
    page,
    pageSize,
    search,
  ]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <>
      <TableRow
        className="hover:bg-muted/10 cursor-pointer border-l-4"
        style={{ borderLeftColor: group.color }}
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell colSpan={8} className="py-3 px-6 bg-muted/10">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            )}
            <span className="font-bold text-sm" style={{ color: group.color }}>
              {group.title.toUpperCase()}
            </span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-full">
              {typeof count === "number" ? count : "—"}
            </Badge>
            {loading ? <span className="text-xs text-muted-foreground">Loading...</span> : null}
          </div>
        </TableCell>
      </TableRow>

      {expanded ? (
        rows.length === 0 ? (
          <TableRow className="border-l-4 border-transparent">
            <TableCell colSpan={8} className="py-4 px-6 text-sm text-muted-foreground">
              No records.
            </TableCell>
          </TableRow>
        ) : (
          <>
            {rows.map((deal) => {
              const href = `/customers/lead-detail?${encodeURIComponent(String(deal.id))}`;
              return (
                <TableRow
                  key={deal.id}
                  className="group transition-colors hover:bg-muted/20 border-l-4 border-transparent hover:border-muted-foreground/20 cursor-pointer"
                  role="link"
                  tabIndex={0}
                  onClick={() => {
                    void router.push(href);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void router.push(href);
                    }
                  }}
                >
                  <TableCell className="py-4 px-6 text-sm w-[140px]">
                    <Link
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold hover:underline"
                    >
                      {deal.policy_number ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[110px]">
                    <span className="text-muted-foreground truncate block max-w-[110px]">{deal.carrier ?? "—"}</span>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[160px] overflow-hidden">
                    {statusBadge(deal.policy_status)}
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[180px]">
                    <div className="truncate max-w-[180px] font-medium">{deal.ghl_name ?? "—"}</div>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[110px]">
                    <span className="tabular-nums">{deal.phone_number ?? "—"}</span>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[130px]">
                    <Badge variant="secondary" className="bg-secondary/50">
                      {deal.call_center ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-5 px-6 text-sm w-[160px]">
                    <span className="truncate block max-w-[160px]">{deal.ghl_stage ?? "—"}</span>
                  </TableCell>
                  <TableCell className="py-5 px-6 text-sm w-[170px] align-top">
                    <div className="flex flex-col items-end justify-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          void router.push(href);
                        }}
                      >
                        <EyeIcon className="size-4" />
                        View
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            <TableRow className="border-none bg-transparent">
              <TableCell colSpan={8} className="py-3 px-6">
                <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                  <div>
                    Page <span className="font-medium">{page}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || !hasMore}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </>
        )
      ) : null}
    </>
  );
}
