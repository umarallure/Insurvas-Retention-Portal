"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterIcon, SearchIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";

import { GroupedDealsGroup, type DealGroup } from "@/components/customers/grouped-deals-group";

const GROUPS: DealGroup[] = [
  { id: "topics", title: "Pending / Submitted", color: "#757575" },
  { id: "group_mkrtrbry", title: "Incomplete/Closed as Incomplete", color: "#579bfc" },
  { id: "closed", title: "Issued Not Paid", color: "#ffcb00" },
  { id: "group_mkrnbe1n", title: "Pending Lapse", color: "#ffcb00" },
  { id: "group_mkqjtt5t", title: "DNC", color: "#ff007f" },
  { id: "group_mknk1k9f", title: "Issued Paid", color: "#007eb5" },
  { id: "group_mknk5erx", title: "Charged Back", color: "#bb3354" },
  { id: "group_mkpe61ez", title: "DQ", color: "#cab641" },
  { id: "group_mknk4n43", title: "Past ChargeBack Period", color: "#037f4c" },
  { id: "group_mkpkvn4f", title: "Needs to be resold", color: "#ff5ac4" },
  { id: "group_mkpt4gvj", title: "CANNOT BE FOUND IN CARRIER", color: "#fdab3d" },
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

      setMatchingGroupTitles(s);
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  const visibleGroups = React.useMemo(() => {
    let groups = GROUPS;

    // If searching, only show groups that actually have matches.
    if (matchingGroupTitles) {
      groups = groups.filter((g) => matchingGroupTitles.has(g.title));
    }

    if (groupFilter === "all") return groups;
    return groups.filter((g) => g.id === groupFilter);
  }, [groupFilter, matchingGroupTitles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="relative w-full max-w-md">
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
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[120px]">
                Carrier
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[200px]">
                Policy Status
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[220px]">
                GHL Name
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[140px]">
                Phone No
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[140px]">
                Center
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-4 px-6 w-[120px]">
                Creation Date
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
