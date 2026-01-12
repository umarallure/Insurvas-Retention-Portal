"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilterIcon, RefreshCcw, SearchIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CATEGORY_ORDER, CATEGORY_TO_GHL_STAGES, type DealCategory } from "@/lib/monday-deal-category-tags";

import { DealsKanbanColumn } from "@/components/customers/deals-kanban-column";
import type { DealGroup } from "@/components/customers/grouped-deals-group";
import type { DealsKanbanRow } from "@/components/customers/deals-kanban-card";

const GROUPS: DealGroup[] = [
  {
    id: "failed_payment",
    title: "Failed Payment",
    color: "#B91C1C",
    queryStages: CATEGORY_TO_GHL_STAGES["Failed Payment"],
  },
  {
    id: "pending_lapse",
    title: "Pending Lapse",
    color: "#B45309",
    queryStages: CATEGORY_TO_GHL_STAGES["Pending Lapse"],
  },
  {
    id: "pending_manual_action",
    title: "Pending Manual Action",
    color: "#1D4ED8",
    queryStages: CATEGORY_TO_GHL_STAGES["Pending Manual Action"],
  },
  {
    id: "chargeback",
    title: "Chargeback",
    color: "#BE123C",
    queryStages: CATEGORY_TO_GHL_STAGES["Chargeback"],
  },
];

type GroupState = {
  loading: boolean;
  rows: DealsKanbanRow[];
  count: number | null;
  hasMore: boolean;
};

type DealsKanbanGroup = {
  id: string;
  title: string;
  color: string;
  query: DealGroup;
};

type DealsKanbanViewProps = {
  onRefresh?: () => void;
  refreshLoading?: boolean;
};

function buildGroupQuery(group: DealGroup, search: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  const stages = (group.queryStages && group.queryStages.length > 0 ? group.queryStages : group.queryStage ? [group.queryStage] : []).filter(Boolean);

  let q = supabase
    .from("monday_com_deals")
    .select("id,monday_item_id,policy_number,carrier,policy_status,ghl_name,ghl_stage,phone_number,call_center,deal_name", {
      count: "exact",
    })
    .eq("is_active", true)
    .order("last_updated", { ascending: false, nullsFirst: false })
    .range(from, to);

  const includeOr: string[] = [];
  for (const s of stages) includeOr.push(`ghl_stage.ilike.%${s.replace(/,/g, "")}%`);

  const shouldUseOr = stages.length > 0;
  if (shouldUseOr) {
    q = q.or(includeOr.join(","));
  }

  const trimmed = search.trim();
  if (trimmed) {
    const escaped = trimmed.replace(/,/g, "");
    q = q.or(
      `policy_number.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,deal_name.ilike.%${escaped}%,ghl_name.ilike.%${escaped}%`,
    );
  }

  return q;
}

export function DealsKanbanView(props: DealsKanbanViewProps) {
  const { onRefresh, refreshLoading } = props;
  const [search, setSearch] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState<string>("all");

  // Responsive page size based on screen size
  const [pageSize, setPageSize] = React.useState(() => {
    if (typeof window === "undefined") return 10;
    const height = window.innerHeight;
    // Calculate cards per column based on available height
    // Each card is ~180px, plus header (~100px), pagination (~60px), padding (~40px)
    const availableHeight = height - 200;
    const cardsPerColumn = Math.max(5, Math.floor(availableHeight / 180));
    return Math.min(20, cardsPerColumn); // Cap at 20 cards per page
  });

  React.useEffect(() => {
    const updatePageSize = () => {
      if (typeof window === "undefined") return;
      const height = window.innerHeight;
      const availableHeight = height - 200;
      const cardsPerColumn = Math.max(5, Math.floor(availableHeight / 180));
      setPageSize(Math.min(20, cardsPerColumn));
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
    for (const g of GROUPS) {
      m[g.id] = { loading: false, rows: [], count: null, hasMore: false };
    }
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

  const visibleGroups = React.useMemo<DealsKanbanGroup[]>(() => {
    let groups: DealsKanbanGroup[] = GROUPS.map((g) => ({ id: g.id, title: g.title, color: g.color, query: g }));
    groups.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a.title as DealCategory);
      const ib = CATEGORY_ORDER.indexOf(b.title as DealCategory);
      return ia - ib;
    });
    if (groupFilter === "all") return groups;
    groups = groups.filter((g) => g.id === groupFilter);
    return groups;
  }, [groupFilter]);

  // Ensure pagination/state dictionaries contain keys for the visible groups.
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
            const q = buildGroupQuery(g.query, search, pageForGroup, pageSize);
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
              console.error("[deals-kanban-view] fetch error", { group: r.g.id, error: r.error });
              next[r.g.id] = { loading: false, rows: [], count: null, hasMore: false };
              continue;
            }

            const fetched = ((r.data ?? []) as DealsKanbanRow[]) ?? [];
            next[r.g.id] = {
              loading: false,
              rows: fetched.slice(0, pageSize),
              count: typeof r.count === "number" ? r.count : null,
              hasMore: fetched.length > pageSize,
            };
          }
          return next;
        });
      } catch (e) {
        console.error("[deals-kanban-view] fetch error", e);
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
            placeholder="Search by Policy Number, Phone, or Deal Name..."
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
          className="grid h-full min-h-0 gap-2 w-full"
          style={{ 
            alignItems: "stretch", 
            gridTemplateColumns: `repeat(${visibleGroups.length}, minmax(0, 1fr))`
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
