"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterIcon, SearchIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";

import { DealsKanbanColumn } from "@/components/customers/deals-kanban-column";
import type { DealGroup } from "@/components/customers/grouped-deals-group";
import type { DealsKanbanRow } from "@/components/customers/deals-kanban-card";

const GROUPS: DealGroup[] = [
  {
    id: "failed_payment",
    title: "Failed Payment",
    queryTitleIlike: ["%FDPF%", "%Failed Payment%"],
    excludeStageIlike: ["%Chargeback%", "%Charged Back%"],
    color: "#bb3354",
  },
  {
    id: "pending_lapse",
    title: "Pending Lapse",
    queryStageIlike: ["%Pending Lapse%"],
    color: "#ffcb00",
  },
  {
    id: "pending_manual_action",
    title: "Pending Manual Action",
    queryTitleIlike: ["%Pending Manual Action%", "%Manual Action%"],
    queryStageIlike: ["%Pending Manual Action%", "%Manual Action%"],
    color: "#fdab3d",
  },
  {
    id: "chargeback",
    title: "Chargeback",
    queryTitleIlike: ["%Charged Back%", "%Chargeback%"],
    queryStageIlike: ["%Chargeback%", "%Charged Back%"],
    color: "#bb3354",
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

function patternToRegex(pattern: string) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = "^" + escaped.replace(/%/g, ".*") + "$";
  return new RegExp(re, "i");
}

function stableColorFromString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 45%)`;
}

function normalizeGroupTitle(t: string | null) {
  const v = typeof t === "string" ? t.trim() : "";
  return v.length ? v : "Unknown";
}

function colorForGroupTitle(title: string) {
  for (const g of GROUPS) {
    const candidates = (g.queryTitles && g.queryTitles.length > 0 ? g.queryTitles : [g.queryTitle ?? g.title]).filter(Boolean);
    for (const t of candidates) {
      if (t && title.toLowerCase() === String(t).toLowerCase()) return g.color;
    }
    for (const p of (g.queryTitleIlike ?? []).filter(Boolean)) {
      if (patternToRegex(p).test(title)) return g.color;
    }
  }
  return stableColorFromString(title);
}

function buildGroupQuery(group: DealGroup, search: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  const titles = (group.queryTitles && group.queryTitles.length > 0 ? group.queryTitles : [group.queryTitle ?? group.title]).filter(
    Boolean,
  );
  const ilikePatterns = (group.queryTitleIlike ?? []).filter(Boolean);

  const stages = (group.queryStages && group.queryStages.length > 0
    ? group.queryStages
    : group.queryStage
      ? [group.queryStage]
      : []).filter(Boolean);

  const stageIlikePatterns = (group.queryStageIlike ?? []).filter(Boolean);
  const excludeTitleIlike = (group.excludeTitleIlike ?? []).filter(Boolean);
  const excludeStageIlike = (group.excludeStageIlike ?? []).filter(Boolean);

  let q = supabase
    .from("monday_com_deals")
    .select("id,monday_item_id,policy_number,carrier,policy_status,ghl_name,ghl_stage,phone_number,call_center,deal_name", {
      count: "exact",
    })
    .order("last_updated", { ascending: false, nullsFirst: false })
    .range(from, to);

  const includeOr: string[] = [];
  for (const p of ilikePatterns) includeOr.push(`group_title.ilike.${p}`);
  for (const t of titles) includeOr.push(`group_title.eq.${t}`);

  for (const p of stageIlikePatterns) includeOr.push(`ghl_stage.ilike.${p}`);
  for (const s of stages) includeOr.push(`ghl_stage.eq.${s}`);

  const shouldUseOr = stageIlikePatterns.length > 0 || stages.length > 0 || ilikePatterns.length > 0;
  if (shouldUseOr) {
    q = q.or(includeOr.join(","));
  } else if (titles.length > 0) {
    q = q.in("group_title", titles);
  } else {
    // When searching, we may create an "Unknown" column for deals missing group_title.
    // In that case, match null group_title.
    const isUnknown = (group.title ?? "").trim().toLowerCase() === "unknown";
    if (isUnknown) {
      q = q.is("group_title", null);
    }
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
      `policy_number.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,deal_name.ilike.%${escaped}%,ghl_name.ilike.%${escaped}%`,
    );
  }

  return q;
}

export function DealsKanbanView() {
  const [search, setSearch] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState<string>("all");
  const [matchingGroupTitles, setMatchingGroupTitles] = React.useState<Set<string> | null>(null);

  const pageSize = 25;
  const trimmedSearch = search.trim();
  const isSearchMode = trimmedSearch.length > 0;
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

  React.useEffect(() => {
    let cancelled = false;

    if (!trimmedSearch) {
      setMatchingGroupTitles(null);
      return;
    }

    void (async () => {
      const escaped = trimmedSearch.replace(/,/g, "");

      const { data, error } = await supabase
        .from("monday_com_deals")
        .select("group_title")
        .or(
          `policy_number.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,deal_name.ilike.%${escaped}%,ghl_name.ilike.%${escaped}%`,
        )
        .limit(5000);

      if (cancelled) return;

      if (error) {
        console.error("[deals-kanban-view] search groups error", error);
        setMatchingGroupTitles(new Set());
        return;
      }

      const titles = new Set<string>();
      for (const row of (data ?? []) as Array<{ group_title: string | null }>) {
        titles.add(normalizeGroupTitle(row.group_title));
      }

      setMatchingGroupTitles(titles);
    })();

    return () => {
      cancelled = true;
    };
  }, [trimmedSearch]);

  const visibleGroups = React.useMemo<DealsKanbanGroup[]>(() => {
    // Search mode: show dynamic columns based on the actual group_title values that matched.
    if (isSearchMode) {
      const titles = matchingGroupTitles ? Array.from(matchingGroupTitles) : [];
      titles.sort((a, b) => a.localeCompare(b));

      return titles.map((t) => {
        const q: DealGroup = {
          id: `gt:${t}`,
          title: t,
          queryTitle: t === "Unknown" ? undefined : t,
          queryTitleIlike: t === "Unknown" ? undefined : undefined,
          color: colorForGroupTitle(t),
        };

        return {
          id: q.id,
          title: q.title,
          color: q.color,
          query: q,
        };
      });
    }

    // Normal mode: the original four groups.
    let groups: DealsKanbanGroup[] = GROUPS.map((g) => ({ id: g.id, title: g.title, color: g.color, query: g }));
    if (groupFilter === "all") return groups;
    groups = groups.filter((g) => g.id === groupFilter);
    return groups;
  }, [groupFilter, isSearchMode, matchingGroupTitles]);

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
    <div className="flex flex-col gap-6 h-full min-h-0">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="relative w-full max-w-2xl">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by Policy Number, Phone, or Deal Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 border-none bg-muted/50 focus-visible:ring-1"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <FilterIcon className="size-4 text-muted-foreground hidden sm:block" />
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full sm:w-[260px] h-10 bg-muted/50 border-none">
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
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div
          className="grid gap-4 h-full min-h-0 grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
          style={{ alignItems: "stretch" }}
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
