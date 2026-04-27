"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  CALL_BACK_DEALS_NAV_STORAGE_KEY,
  normaliseCallBackDealId,
} from "@/lib/call-back-deals/navigation-context";
import { EyeIcon, Loader2 } from "lucide-react";

type CallBackDealRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  submission_id: string;
  stage: string | null;
  call_center: string | null;
  assigned_at: string | null;
  is_active: boolean;
};

const PAGE_SIZE = 25;

const STAGE_OPTIONS = [
  "Incomplete Transfer",
  "Application Withdrawn",
  "Needs BPO Callback",
  "Declined Underwriting",
];

export default function AgentCallBackDealsPage() {
  const [rows, setRows] = useState<CallBackDealRow[]>([]);
  const [retentionData, setRetentionData] = useState<Record<string, { status: string; notes: string }>>({});
  const [navigationDealIds, setNavigationDealIds] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    byStage: Record<string, number>;
  }>({ total: 0, byStage: {} });

  const pageCount = useMemo(() => {
    if (!totalRows) return 1;
    return Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  }, [totalRows]);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setRows([]);
        setTotalRows(0);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profileError || !profile?.id) {
        setRows([]);
        setTotalRows(0);
        return;
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let statusFilteredSubmissionIds: string[] | null = null;
      if (statusFilter !== "all") {
        const { data: statusMatches } = await supabase
          .from("retention_deal_flow")
          .select("submission_id")
          .eq("status", statusFilter);
        const filtered = (statusMatches ?? []).map((m) => m.submission_id).filter(Boolean);
        if (filtered.length === 0) {
          setRows([]);
          setTotalRows(0);
          return;
        }
        statusFilteredSubmissionIds = filtered;
      }

      let listQuery = supabase
        .from("call_back_deals")
        .select(
          "id, name, phone_number, submission_id, stage, call_center, assigned_at, is_active",
          { count: "exact" },
        )
        .eq("assigned_to_profile_id", profile.id as string)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false, nullsFirst: false });

      let navQuery = supabase
        .from("call_back_deals")
        .select("id")
        .eq("assigned_to_profile_id", profile.id as string)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false, nullsFirst: false })
        .limit(2000);

      if (stageFilter !== "all") {
        listQuery = listQuery.eq("stage", stageFilter);
        navQuery = navQuery.eq("stage", stageFilter);
      }

      if (statusFilteredSubmissionIds !== null) {
        listQuery = listQuery.in("submission_id", statusFilteredSubmissionIds);
        navQuery = navQuery.in("submission_id", statusFilteredSubmissionIds);
      }

      const trimmed = search.trim();
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        const orClause = `name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,submission_id.ilike.%${escaped}%`;
        listQuery = listQuery.or(orClause);
        navQuery = navQuery.or(orClause);
      }

      const [listResult, navResult] = await Promise.all([
        listQuery.range(from, to),
        navQuery,
      ]);

      const { data, error, count } = listResult;
      if (error) throw error;
      if (navResult.error) throw navResult.error;

      let deals = data ?? [];
      setTotalRows(count ?? null);
      setNavigationDealIds(
        (navResult.data ?? []).map((r: { id: string }) => normaliseCallBackDealId(String(r.id))),
      );

      const submissionIds = deals.map((d) => d.submission_id).filter(Boolean);

      if (submissionIds.length > 0) {
        const { data: retentionRows } = await supabase
          .from("retention_deal_flow")
          .select("submission_id, status, notes")
          .in("submission_id", submissionIds);

        const retentionMap: Record<string, { status: string; notes: string }> = {};
        const uniqueStatuses = new Set<string>();

        if (retentionRows) {
          for (const r of retentionRows) {
            retentionMap[r.submission_id] = {
              status: r.status ?? "",
              notes: r.notes ?? "",
            };
            if (r.status) uniqueStatuses.add(r.status);
          }
        }

        setRetentionData(retentionMap);
        setStatusOptions(Array.from(uniqueStatuses).sort());
      }

      setRows(deals as CallBackDealRow[]);
    } catch (error) {
      console.error("[agent-call-back-deals] load error", error);
      setRows([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }, [page, stageFilter, search, statusFilter]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  useEffect(() => {
    if (statusFilter === "all" && Object.keys(retentionData).length === 0) return;
    if (statusFilter !== "all") {
      setPage(1);
    }
    void loadDeals();
  }, [statusFilter]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setStats({ total: 0, byStage: {} });
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", session.user.id).maybeSingle();

      if (!profile?.id) {
        setStats({ total: 0, byStage: {} });
        return;
      }

      const { count: totalCount } = await supabase
        .from("call_back_deals")
        .select("*", { count: "exact", head: true })
        .eq("assigned_to_profile_id", profile.id)
        .eq("is_active", true);

      const { data: stageData } = await supabase
        .from("call_back_deals")
        .select("stage")
        .eq("assigned_to_profile_id", profile.id)
        .eq("is_active", true);

      const byStage: Record<string, number> = {};
      (stageData ?? []).forEach((row: { stage: string | null }) => {
        const stage = row.stage ?? "Unknown";
        byStage[stage] = (byStage[stage] || 0) + 1;
      });

      setStats({ total: totalCount ?? 0, byStage });
    } catch (error) {
      console.error("[agent-call-back-deals] loadStats error", error);
      setStats({ total: 0, byStage: {} });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="w-full">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">New Sale Deals</h2>
            </div>
            <CardDescription>Call back deals assigned to you from the CRM.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-sm text-muted-foreground">Total Assigned</div>
                <div className="text-2xl font-bold">{statsLoading ? "-" : stats.total}</div>
              </div>
              {STAGE_OPTIONS.map((stage) => (
                <div key={stage} className="rounded-lg border bg-card p-3">
                  <div className="text-sm text-muted-foreground truncate" title={stage}>
                    {stage.split(" ").slice(0, 2).join(" ")}
                  </div>
                  <div className="text-2xl font-bold">
                    {statsLoading ? "-" : stats.byStage[stage] ?? 0}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                placeholder="Search by name, phone, or submission ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="flex-1"
              />
              <Select
                value={stageFilter}
                onValueChange={(v) => {
                  setStageFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="All Stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {STAGE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={() => {
                  void loadDeals();
                  void loadStats();
                }}
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>

            <div className="rounded-md border">
              <div
                className="grid gap-3 p-3 text-sm font-medium text-muted-foreground"
                style={{ gridTemplateColumns: "1.5fr 1fr 0.8fr 1fr 1fr 1fr 0.8fr" }}
              >
                <div>Name</div>
                <div>Phone</div>
                <div>Stage</div>
                <div>Status</div>
                <div>Notes</div>
                <div>Assigned</div>
                <div className="text-right">Actions</div>
              </div>

              {loading ? (
                <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : rows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No call back deals assigned.</div>
              ) : (
                rows.map((row) => {
                  const assigned = row.assigned_at
                    ? (() => {
                        const d = new Date(row.assigned_at);
                        const now = new Date();
                        const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
                        if (days === 0) return "Today";
                        if (days === 1) return "Yesterday";
                        if (days < 7) return `${days}d ago`;
                        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      })()
                    : "—";
                  return (
                    <div
                      key={row.id}
                      className="grid gap-3 p-3 text-sm items-center border-t"
                      style={{ gridTemplateColumns: "1.5fr 1fr 0.8fr 1fr 1fr 1fr 0.8fr" }}
                    >
                      <div className="truncate" title={row.name ?? undefined}>
                        <span className="font-medium">{row.name ?? "Unknown"}</span>
                      </div>
                      <div className="truncate font-mono text-xs">{row.phone_number ?? "—"}</div>
                      <div className="truncate">{row.stage ?? "—"}</div>
                      <div className="truncate text-xs">{retentionData[row.submission_id]?.status ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground max-w-[120px]" title={retentionData[row.submission_id]?.notes ?? undefined}>
                        {retentionData[row.submission_id]?.notes ? retentionData[row.submission_id].notes.slice(0, 30) + (retentionData[row.submission_id].notes.length > 30 ? "..." : "") : "—"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{assigned}</div>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" className="gap-1" asChild>
                          <a
                            href={`/agent/call-back-deal-details?id=${encodeURIComponent(row.id)}`}
                            onClick={() => {
                              try {
                                sessionStorage.setItem(
                                  CALL_BACK_DEALS_NAV_STORAGE_KEY,
                                  JSON.stringify({
                                    dealIds: navigationDealIds,
                                    createdAt: Date.now(),
                                  }),
                                );
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            <EyeIcon className="size-4" />
                            View
                          </a>
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
              <div>
                Page {page} of {pageCount}
                {totalRows != null ? <> • Total {totalRows}</> : null}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
