"use client";

import * as React from "react";
import Link from "next/link";

import type { MondayComDeal } from "@/types";
import { supabase } from "@/lib/supabase";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

export type DealGroup = {
  id: string;
  title: string;
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
  | "phone_number"
  | "call_center"
  | "deal_creation_date"
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

    setLoading(true);
    try {
      let q = supabase
        .from("monday_com_deals")
        .select(
          "id,monday_item_id,policy_number,carrier,policy_status,ghl_name,phone_number,call_center,deal_creation_date",
          { count: "exact" }
        )
        .eq("group_title", group.title)
        .order("last_updated", { ascending: false, nullsFirst: false })
        .range(from, to);

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
  }, [group.title, page, pageSize, search]);

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
        <TableCell colSpan={7} className="py-3 px-6 bg-muted/10">
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
            <TableCell colSpan={7} className="py-4 px-6 text-sm text-muted-foreground">
              No records.
            </TableCell>
          </TableRow>
        ) : (
          <>
            {rows.map((deal) => {
              const id = deal.monday_item_id ?? String(deal.id);
              return (
                <TableRow
                  key={deal.id}
                  className="group transition-colors hover:bg-muted/20 border-l-4 border-transparent hover:border-muted-foreground/20"
                >
                  <TableCell className="py-4 px-6 text-sm w-[140px]">
                    <Link href={`/customers/${id}`} className="font-semibold hover:underline">
                      {deal.policy_number ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[120px]">
                    <span className="text-muted-foreground truncate block max-w-[120px]">{deal.carrier ?? "—"}</span>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[200px] overflow-hidden">
                    {statusBadge(deal.policy_status)}
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[220px]">
                    <div className="truncate max-w-[220px] font-medium">{deal.ghl_name ?? "—"}</div>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[140px]">
                    <span className="tabular-nums">{deal.phone_number ?? "—"}</span>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[140px]">
                    <Badge variant="secondary" className="bg-secondary/50">
                      {deal.call_center ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-sm w-[120px]">
                    {deal.deal_creation_date ? new Date(deal.deal_creation_date).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              );
            })}

            <TableRow className="border-none bg-transparent">
              <TableCell colSpan={7} className="py-3 px-6">
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
