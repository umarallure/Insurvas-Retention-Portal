"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterIcon, SearchIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";

import { GroupedDealsGroup, type DealGroup } from "@/components/customers/grouped-deals-group";

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

export function GroupedDealsView() {
  const [search, setSearch] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState<string>("all");
  const [matchingGroupTitles, setMatchingGroupTitles] = React.useState<Set<string> | null>(null);

  const pageSize = 25;

  React.useEffect(() => {
    let cancelled = false;

    const trimmed = search.trim();
    if (!trimmed) {
      setMatchingGroupTitles(null);
      return;
    }

    void (async () => {
      const escaped = trimmed.replace(/,/g, "");

      const { data, error } = await supabase
        .from("monday_com_deals")
        .select("group_title")
        .not("group_title", "is", null)
        .or(`policy_number.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,deal_name.ilike.%${escaped}%`)
        .limit(5000);

      if (cancelled) return;

      if (error) {
        console.error("[grouped-deals-view] search groups error", error);
        setMatchingGroupTitles(new Set());
        return;
      }

      const s = new Set<string>();
      for (const row of (data ?? []) as Array<{ group_title: string | null }>) {
        if (row.group_title) s.add(row.group_title);
      }

      const visible = new Set<string>();
      for (const g of GROUPS) {
        const titles = (g.queryTitles && g.queryTitles.length > 0
          ? g.queryTitles
          : [g.queryTitle ?? g.title]
        ).filter(Boolean);

        if (titles.some((t) => s.has(t))) {
          visible.add(g.id);
        }
      }

      setMatchingGroupTitles(visible);
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  const visibleGroups = React.useMemo(() => {
    let groups = GROUPS;

    // If searching, only show groups that actually have matches.
    if (matchingGroupTitles) {
      groups = groups.filter((g) => matchingGroupTitles.has(g.id));
    }

    if (groupFilter === "all") return groups;
    return groups.filter((g) => g.id === groupFilter);
  }, [groupFilter, matchingGroupTitles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table className="table-fixed border-collapse">
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[140px]">
                Policy Number
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[100px]">
                Carrier
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[160px]">
                Policy Status
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[180px]">
                GHL Name
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[110px]">
                Phone No
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[130px]">
                Center
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[160px]">
                GHL Stage
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[170px] text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleGroups.map((g) => (
              <GroupedDealsGroup key={g.id} group={g} search={search} pageSize={pageSize} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
