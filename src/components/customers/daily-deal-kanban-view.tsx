"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilterIcon, RefreshCcw, SearchIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";

import { DealsKanbanColumn } from "@/components/customers/deals-kanban-column";
import { DealsKanbanCard, type DealsKanbanRow } from "@/components/customers/deals-kanban-card";

// Two groups we want to show
const GROUPS = [
  { id: "incomplete_transfer", title: "Incomplete Transfer", color: "#D97706", status: "Incomplete Transfer" },
  { id: "needs_bpo_callback", title: "Needs BPO Callback", color: "#0EA5A4", status: "Needs BPO Callback" },
];

type GroupState = {
  loading: boolean;
  rows: DealsKanbanRow[];
  count: number | null;
  hasMore: boolean;
};

type DailyDealsKanbanProps = {
  onRefresh?: () => void;
  refreshLoading?: boolean;
};

function buildGroupQuery(status: string, search: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  let q = supabase
    .from("daily_deal_flow")
    .select("*", { count: "exact" })
    .eq("status", status)
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  const trimmed = search.trim();
  if (trimmed) {
    const escaped = trimmed.replace(/,/g, "");
    q = q.or(`insured_name.ilike.%${escaped}%,client_phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%,submission_id.ilike.%${escaped}%`);
  }

  return q;
}

export function DailyDealKanbanView(props: DailyDealsKanbanProps) {
  const { onRefresh, refreshLoading } = props;
  const [search, setSearch] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState<string>("all");

  const [pageSize, setPageSize] = React.useState(() => {
    if (typeof window === "undefined") return 8;
    const height = window.innerHeight;
    const availableHeight = height - 200;
    const cardsPerColumn = Math.max(4, Math.floor(availableHeight / 180));
    return Math.min(16, cardsPerColumn);
  });

  React.useEffect(() => {
    const updatePageSize = () => {
      if (typeof window === "undefined") return;
      const height = window.innerHeight;
      const availableHeight = height - 200;
      const cardsPerColumn = Math.max(4, Math.floor(availableHeight / 180));
      setPageSize(Math.min(16, cardsPerColumn));
    };

    updatePageSize();
    window.addEventListener("resize", updatePageSize);
    return () => window.removeEventListener("resize", updatePageSize);
  }, []);

  const [groupPages, setGroupPages] = React.useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const g of GROUPS) m[g.id] = 1;
    return m;
  });

  const [groupState, setGroupState] = React.useState<Record<string, GroupState>>(() => {
    const m: Record<string, GroupState> = {};
    for (const g of GROUPS) m[g.id] = { loading: false, rows: [], count: null, hasMore: false };
    return m;
  });

  const prevGroupPagesRef = React.useRef<Record<string, number> | null>(null);
  const prevSearchRef = React.useRef<string | null>(null);
  const prevVisibleIdsRef = React.useRef<string | null>(null);
  const requestSeqRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    setGroupPages((prev) => {
      const next = { ...prev };
      for (const g of GROUPS) next[g.id] = 1;
      return next;
    });
  }, [search, groupFilter]);

  const visibleGroups = React.useMemo(() => {
    let groups = GROUPS.map((g) => g);
    if (groupFilter === "all") return groups;
    return groups.filter((g) => g.id === groupFilter);
  }, [groupFilter]);

  React.useEffect(() => {
    setGroupPages((prev) => {
      const next = { ...prev };
      for (const g of visibleGroups) {
        if (typeof next[g.id] !== "number") next[g.id] = 1;
      }
      return next;
    });

    setGroupState((prev) => {
      const next = { ...prev };
      for (const g of visibleGroups) {
        if (!next[g.id]) next[g.id] = { loading: false, rows: [], count: null, hasMore: false };
      }
      return next;
    });
  }, [visibleGroups]);

  React.useEffect(() => {
    const run = async () => {
      const currentVisibleIds = visibleGroups.map((g) => g.id).join(",");
      const prevPages = prevGroupPagesRef.current;
      const prevSearch = prevSearchRef.current;
      const prevVisibleIds = prevVisibleIdsRef.current;

      const mustFetchAll = prevSearch !== search || prevVisibleIds !== currentVisibleIds || !prevPages;

      const groupsToFetch = mustFetchAll
        ? visibleGroups
        : visibleGroups.filter((g) => (prevPages[g.id] ?? 1) !== (groupPages[g.id] ?? 1));

      prevGroupPagesRef.current = groupPages;
      prevSearchRef.current = search;
      prevVisibleIdsRef.current = currentVisibleIds;

      if (groupsToFetch.length === 0) return;

      const requestTokens: Record<string, number> = {};
      for (const g of groupsToFetch) {
        const nextSeq = (requestSeqRef.current[g.id] ?? 0) + 1;
        requestSeqRef.current[g.id] = nextSeq;
        requestTokens[g.id] = nextSeq;
      }

      setGroupState((prev) => {
        const next = { ...prev };
        for (const g of groupsToFetch) {
          next[g.id] = { ...(next[g.id] ?? { rows: [], count: null, hasMore: false }), loading: true };
        }
        return next;
      });

      try {
        const results = await Promise.all(
          groupsToFetch.map(async (g) => {
            const pageForGroup = typeof groupPages[g.id] === "number" ? groupPages[g.id] : 1;
            const q = buildGroupQuery(g.status, search, pageForGroup, pageSize);
            const { data, error, count } = await q;
            return { g, data, error, count };
          }),
        );

        setGroupState((prev) => {
          const next = { ...prev };
          for (const r of results) {
            const token = requestTokens[r.g.id];
            const currentToken = requestSeqRef.current[r.g.id];
            if (!token || token !== currentToken) {
              continue;
            }
            if (r.error) {
              console.error("[daily-deals-kanban] fetch error", { group: r.g.id, error: r.error });
              next[r.g.id] = { loading: false, rows: [], count: null, hasMore: false };
              continue;
            }

            const fetched = (r.data ?? []) as any[];

            // Map daily_deal_flow row into DealsKanbanRow shape
            const mapped = (fetched ?? []).map((d) => {
              const row: DealsKanbanRow = {
                id: d.id,
                monday_item_id: null,
                policy_number: d.policy_number ?? null,
                carrier: d.carrier ?? null,
                policy_status: d.policy_status ?? null,
                ghl_name: d.insured_name ?? d.deal_name ?? d.ghl_name ?? null,
                ghl_stage: d.status ?? null,
                phone_number: d.client_phone_number ?? d.phone_number ?? null,
                call_center: d.call_center ?? d.lead_vendor ?? d.call_center ?? null,
                deal_name: d.deal_name ?? d.submission_id ?? null,
              };
              // mark as non-clickable for this view
              (row as any).__clickable = false;
              return row;
            });

            next[r.g.id] = {
              loading: false,
              rows: mapped.slice(0, pageSize),
              count: typeof r.count === "number" ? r.count : null,
              hasMore: (r.data ?? []).length > pageSize,
            };
          }
          return next;
        });
      } catch (e) {
        console.error("[daily-deals-kanban] fetch error", e);
        setGroupState((prev) => {
          const next = { ...prev };
          for (const g of groupsToFetch) {
            const token = requestTokens[g.id];
            const currentToken = requestSeqRef.current[g.id];
            if (!token || token !== currentToken) continue;
            next[g.id] = { loading: false, rows: [], count: null, hasMore: false };
          }
          return next;
        });
      }
    };

    void run();
  }, [groupPages, pageSize, search, visibleGroups]);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-4 rounded-lg border shadow-sm shrink-0">
        <div className="relative w-full sm:flex-1 max-w-none">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, policy, or submission..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-12 text-lg border-none bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
          <FilterIcon className="size-5 text-muted-foreground hidden sm:block" />
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full sm:w-[220px] h-12 text-lg bg-muted/50 border-none focus:ring-2 focus:ring-primary/20">
              <SelectValue placeholder="All Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {GROUPS.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {onRefresh ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={!!refreshLoading}
              className="w-fit shadow-sm bg-card hover:bg-muted h-12 px-4 text-base font-medium"
            >
              <RefreshCcw className={`mr-2 size-5 ${refreshLoading ? "animate-spin" : ""}`} />
              {refreshLoading ? "Syncing..." : "Refresh"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full">
        <div
          className="grid h-full min-h-0 gap-2 w-full mx-auto"
          style={{
            alignItems: "stretch",
            gridTemplateColumns: `repeat(${visibleGroups.length}, minmax(0, 1fr))`,
            maxWidth: 1200,
            margin: "0 auto",
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          {visibleGroups.map((g) => {
            const s = groupState[g.id] ?? { loading: false, rows: [], count: null, hasMore: false };
            const pageForGroup = typeof groupPages[g.id] === "number" ? groupPages[g.id] : 1;
            const canPrev = pageForGroup > 1;
            const canNext = !s.loading && s.hasMore;
            return (
              <div key={g.id} className="min-h-0 h-full">
                <DealsKanbanColumn
                  title={g.title}
                  color={g.color}
                  count={s.count}
                  loading={s.loading}
                  rows={s.rows}
                  page={pageForGroup}
                  pageSize={pageSize}
                  canPrev={!s.loading && canPrev}
                  canNext={canNext}
                  onPrev={() => {
                    setGroupPages((prev) => ({ ...prev, [g.id]: Math.max(1, pageForGroup - 1) }));
                  }}
                  onNext={() => {
                    if (!canNext) return;
                    setGroupPages((prev) => ({ ...prev, [g.id]: pageForGroup + 1 }));
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
