"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { EyeIcon, Loader2 } from "lucide-react";

type FailedPaymentFixRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  policy_number: string;
  carrier: string | null;
  policy_type: string | null;
  policy_status: string | null;
  carrier_status: string | null;
  deal_value: number | null;
  cc_value: number | null;
  call_center: string | null;
  sales_agent: string | null;
  assigned_at: string | null;
  is_active: boolean;
  failure_reason: string | null;
  failure_date: string | null;
};

const PAGE_SIZE = 25;

const POLICY_STATUS_OPTIONS = [
  "Failed Payment",
  "Payment Due",
  "Active",
  "Cancelled",
  "Pending",
  "Expired",
];

export default function AgentFailedPaymentFixesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<FailedPaymentFixRow[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
  }>({ total: 0, byStatus: {} });

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

      let listQuery = supabase
        .from("failed_payment_fixes")
        .select(
          "id, name, phone_number, email, policy_number, carrier, policy_type, policy_status, carrier_status, deal_value, cc_value, call_center, sales_agent, assigned_at, is_active, failure_reason, failure_date",
          { count: "exact" },
        )
        .eq("assigned_to_profile_id", profile.id as string)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false, nullsFirst: false });

      if (statusFilter !== "all") {
        listQuery = listQuery.eq("policy_status", statusFilter);
      }

      const trimmed = search.trim();
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        const orClause = `name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%`;
        listQuery = listQuery.or(orClause);
      }

      const { data, error, count } = await listQuery.range(from, to);
      if (error) throw error;

      setRows((data ?? []) as FailedPaymentFixRow[]);
      setTotalRows(count ?? null);
    } catch (error) {
      console.error("[agent-failed-payment-fixes] load error", error);
      setRows([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setStats({ total: 0, byStatus: {} });
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", session.user.id).maybeSingle();

      if (!profile?.id) {
        setStats({ total: 0, byStatus: {} });
        return;
      }

      const { count: totalCount } = await supabase
        .from("failed_payment_fixes")
        .select("*", { count: "exact", head: true })
        .eq("assigned_to_profile_id", profile.id)
        .eq("is_active", true);

      const { data: statusData } = await supabase
        .from("failed_payment_fixes")
        .select("policy_status")
        .eq("assigned_to_profile_id", profile.id)
        .eq("is_active", true);

      const byStatus: Record<string, number> = {};
      (statusData ?? []).forEach((row: { policy_status: string | null }) => {
        const status = row.policy_status ?? "Unknown";
        byStatus[status] = (byStatus[status] || 0) + 1;
      });

      setStats({ total: totalCount ?? 0, byStatus });
    } catch (error) {
      console.error("[agent-failed-payment-fixes] loadStats error", error);
      setStats({ total: 0, byStatus: {} });
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
              <h2 className="text-lg font-semibold">Failed Payment Fixes</h2>
            </div>
            <CardDescription>Failed payment fixes assigned to you.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-sm text-muted-foreground">Total Assigned</div>
                <div className="text-2xl font-bold">{statsLoading ? "-" : stats.total}</div>
              </div>
              {POLICY_STATUS_OPTIONS.slice(0, 3).map((status) => (
                <div key={status} className="rounded-lg border bg-card p-3">
                  <div className="text-sm text-muted-foreground truncate" title={status}>
                    {status.split(" ").slice(0, 2).join(" ")}
                  </div>
                  <div className="text-2xl font-bold">
                    {statsLoading ? "-" : stats.byStatus[status] ?? 0}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                placeholder="Search by name, phone, or policy number..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="flex-1"
              />
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
                  {POLICY_STATUS_OPTIONS.map((s) => (
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

            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Phone</th>
                    <th className="text-left px-3 py-2 font-medium">Policy #</th>
                    <th className="text-left px-3 py-2 font-medium">Carrier</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Failure Reason</th>
                    <th className="text-left px-3 py-2 font-medium">Assigned</th>
                    <th className="text-right px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        No failed payment fixes assigned.
                      </td>
                    </tr>
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
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2 truncate max-w-[180px]">
                            <span className="font-medium">{row.name ?? "Unknown"}</span>
                          </td>
                          <td className="px-3 py-2 truncate max-w-[120px] font-mono text-xs">
                            {row.phone_number ?? "—"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[130px] font-mono text-xs">
                            {row.policy_number}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[120px]">{row.carrier ?? "—"}</td>
                          <td className="px-3 py-2 truncate max-w-[120px]">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.policy_status === "Failed Payment"
                                  ? "bg-red-100 text-red-700"
                                  : row.policy_status === "Active"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {row.policy_status ?? "-"}
                            </span>
                          </td>
                          <td className="px-3 py-2 truncate max-w-[150px] text-xs">
                            {row.failure_reason ?? "-"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[100px] text-xs text-muted-foreground">
                            {assigned}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => router.push(`/agent/failed-payment-fix-details?id=${encodeURIComponent(row.id)}`)}
                            >
                              <EyeIcon className="size-4" />
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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
