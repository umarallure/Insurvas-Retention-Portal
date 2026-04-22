import { useEffect, useCallback, useMemo, useState, useRef } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterIcon, Loader2, UserMinus } from "lucide-react";

type RetentionDealFlowRow = Record<string, unknown>;

function toTitleCaseLabel(key: string) {
  const overrides: Record<string, string> = {
    id: "ID",
    submission_id: "Submission ID",
    insured_name: "Insured Name",
    client_phone_number: "Client Phone",
    policy_number: "Policy #",
    lead_vendor: "Lead Vendor",
    product_type: "Product Type",
    retention_agent: "Retention Agent",
    licensed_agent_account: "Licensed Agent",
    buffer_agent: "Buffer Agent",
    call_result: "Call Source",
    monthly_premium: "Monthly Premium",
    face_amount: "Coverage Amount",
    draft_date: "Draft Date",
    created_at: "Created",
    updated_at: "Updated",
  };

  if (overrides[key]) return overrides[key];

  const cleaned = key
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned.length) return key;

  return cleaned
    .split(" ")
    .map((w) => {
      const lower = w.toLowerCase();
      if (lower === "id") return "ID";
      if (lower === "ssn") return "SSN";
      if (lower === "dob") return "DOB";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

const PAGE_SIZE = 25;

export default function RetentionDailyDealFlowPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<RetentionDealFlowRow[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);

  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [carrierFilter, setCarrierFilter] = useState<string[]>([]);
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([]);

  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number> }>({ total: 0, byStatus: {} });

  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(new Set());
  const [unassigning, setUnassigning] = useState(false);
  const [showOnlyActiveLeads, setShowOnlyActiveLeads] = useState(false);

  const [datePreset, setDatePreset] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const datePresetOptions = [
    { value: "all", label: "All Time" },
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "last7days", label: "Last 7 Days" },
    { value: "last30days", label: "Last 30 Days" },
    { value: "custom", label: "Custom Range" },
  ];

  const getDateRangeFromPreset = (preset: string): { from: string; to: string } | null => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const to = new Date(today);
    to.setHours(23, 59, 59, 999);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    switch (preset) {
      case "today":
        return { from: formatDate(today), to: formatDate(to) };
      case "yesterday": {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { from: formatDate(yesterday), to: formatDate(yesterdayEnd) };
      }
      case "last7days": {
        const from = new Date(today);
        from.setDate(from.getDate() - 6);
        return { from: formatDate(from), to: formatDate(to) };
      }
      case "last30days": {
        const from = new Date(today);
        from.setDate(from.getDate() - 29);
        return { from: formatDate(from), to: formatDate(to) };
      }
      default:
        return null;
    }
  };

  const effectiveDateFrom = datePreset === "custom" ? dateFrom : (getDateRangeFromPreset(datePreset)?.from ?? "");
  const effectiveDateTo = datePreset === "custom" ? dateTo : (getDateRangeFromPreset(datePreset)?.to ?? "");

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      window.clearTimeout(t);
    };
  }, [search]);

  const loadRows = useCallback(async (opts?: { toastOnError?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("retention_deal_flow")
        .select("*", { count: "exact" })
        .not("retention_agent", "is", null)
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false, nullsFirst: false });

      // Apply filters
      if (agentFilter.length > 0) {
        query = query.in("retention_agent", agentFilter);
      }

      if (statusFilter && statusFilter !== "all") {
        console.log("[DEBUG] Applying status filter:", statusFilter);
        query = query.ilike("status", `%${statusFilter.trim()}%`);
      } else {
        console.log("[DEBUG] Status filter not applied, statusFilter:", statusFilter);
      }

      if (carrierFilter.length > 0) {
        query = query.in("carrier", carrierFilter);
      }

      if (effectiveDateFrom) {
        query = query.gte("created_at", `${effectiveDateFrom}T00:00:00`);
      }
      if (effectiveDateTo) {
        query = query.lte("created_at", `${effectiveDateTo}T23:59:59`);
      }

      // Apply search
      const trimmed = debouncedSearch.trim();
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        query = query.or(
          `insured_name.ilike.%${escaped}%,client_phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%,submission_id.ilike.%${escaped}%,notes.ilike.%${escaped}%`,
        );
      }

      const { data, error: selectErr, count } = await query.range(from, to);
      if (selectErr) throw selectErr;

      let raw = (data ?? []) as RetentionDealFlowRow[];

      console.log("[DEBUG] loadRows - fetched rows:", raw.length, "count:", count, "statusFilter:", statusFilter);
      if (raw.length > 0) {
        const uniqueStatuses = [...new Set(raw.map(r => r.status).filter(Boolean))];
        console.log("[DEBUG] Unique statuses in fetched data:", uniqueStatuses);
      }

      // Filter to only active leads if enabled
      if (showOnlyActiveLeads) {
        const { data: activeCallbackData } = await supabase
          .from("call_back_deals")
          .select("submission_id")
          .eq("is_active", true);

        const activeSubmissionIds = new Set(
          (activeCallbackData ?? [])
            .map((r: { submission_id: string }) => r.submission_id)
            .filter(Boolean)
        );

        raw = raw.filter((r) => {
          const subId = typeof r.submission_id === "string" ? r.submission_id : "";
          return activeSubmissionIds.has(subId);
        });
      }

      setRawRows(raw);
      setTotalRows(count ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load retention deal flow.";
      setError(msg);
      setRawRows([]);
      setTotalRows(null);
      if (opts?.toastOnError) {
        toastRef.current({ title: "Load failed", description: msg, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, agentFilter, statusFilter, carrierFilter, effectiveDateFrom, effectiveDateTo, showOnlyActiveLeads]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      let query = supabase
        .from("retention_deal_flow")
        .select("status", { count: "exact", head: true })
        .not("retention_agent", "is", null);

      if (effectiveDateFrom) {
        query = query.gte("created_at", `${effectiveDateFrom}T00:00:00`);
      }
      if (effectiveDateTo) {
        query = query.lte("created_at", `${effectiveDateTo}T23:59:59`);
      }

      const { count, error } = await query;
      if (error) throw error;

      let statusQuery = supabase
        .from("retention_deal_flow")
        .select("status")
        .not("retention_agent", "is", null);

      if (effectiveDateFrom) {
        statusQuery = statusQuery.gte("created_at", `${effectiveDateFrom}T00:00:00`);
      }
      if (effectiveDateTo) {
        statusQuery = statusQuery.lte("created_at", `${effectiveDateTo}T23:59:59`);
      }

      const { data: statusData } = await statusQuery;
      const byStatus: Record<string, number> = {};
      (statusData ?? []).forEach((row: { status: string | null }) => {
        const s = row.status ?? "Unknown";
        byStatus[s] = (byStatus[s] || 0) + 1;
      });

      setStats({ total: count ?? 0, byStatus });
    } catch (error) {
      console.error("[retention-deal-flow] loadStats error", error);
      setStats({ total: 0, byStatus: {} });
    } finally {
      setStatsLoading(false);
    }
  }, [effectiveDateFrom, effectiveDateTo]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const loadFilterOptions = useCallback(async () => {
    try {
      let query = supabase
        .from("retention_deal_flow")
        .select("retention_agent, status, carrier")
        .not("retention_agent", "is", null);

      if (effectiveDateFrom) {
        query = query.gte("created_at", `${effectiveDateFrom}T00:00:00`);
      }
      if (effectiveDateTo) {
        query = query.lte("created_at", `${effectiveDateTo}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[retention-deal-flow] loadFilterOptions error", error);
        return;
      }

      const agents = new Set<string>();
      const statuses = new Set<string>();
      const carriers = new Set<string>();

      (data ?? []).forEach((row) => {
        if (typeof row.retention_agent === "string" && row.retention_agent.trim()) {
          agents.add(row.retention_agent.trim());
        }
        if (typeof row.status === "string" && row.status.trim()) {
          statuses.add(row.status.trim());
        }
        if (typeof row.carrier === "string" && row.carrier.trim()) {
          carriers.add(row.carrier.trim());
        }
      });

      setAvailableAgents(Array.from(agents).sort());
      setAvailableStatuses(Array.from(statuses).sort());
      setAvailableCarriers(Array.from(carriers).sort());
      console.log("[DEBUG] Filter options loaded - statuses:", Array.from(statuses).sort());
    } catch (error) {
      console.error("[retention-deal-flow] loadFilterOptions error", error);
    }
  }, [effectiveDateFrom, effectiveDateTo]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions, effectiveDateFrom, effectiveDateTo]);

  const handleBulkUnassign = async () => {
    if (selectedSubmissionIds.size === 0) return;

    setUnassigning(true);
    try {
      const submissionIds = Array.from(selectedSubmissionIds);

      // Update retention_deal_flow entries by clearing retention_agent and setting status to "unassigned"
      const { error } = await supabase
        .from("retention_deal_flow")
        .update({
          retention_agent: null,
          status: "unassigned",
          updated_at: new Date().toISOString(),
        })
        .in("submission_id", submissionIds);

      if (error) throw error;

      // Also update call_back_deals to unassign them
      await supabase
        .from("call_back_deals")
        .update({ assigned: false, is_active: false })
        .in("submission_id", submissionIds);

      toastRef.current({
        title: "Unassign Successful",
        description: `Unassigned ${submissionIds.length} deal(s) from retention deal flow.`,
      });

      setSelectedSubmissionIds(new Set());
      void loadRows();
      void loadStats();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to unassign deals";
      toastRef.current({ title: "Unassign Failed", description: msg, variant: "destructive" });
    } finally {
      setUnassigning(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedSubmissionIds.size === rawRows.length) {
      setSelectedSubmissionIds(new Set());
    } else {
      const allIds = new Set<string>();
      rawRows.forEach((r) => {
        const subId = r["submission_id"];
        if (typeof subId === "string" && subId.trim()) {
          allIds.add(subId.trim());
        }
      });
      setSelectedSubmissionIds(allIds);
    }
  };

  const toggleSelectRow = (submissionId: string) => {
    const newSet = new Set(selectedSubmissionIds);
    if (newSet.has(submissionId)) {
      newSet.delete(submissionId);
    } else {
      newSet.add(submissionId);
    }
    setSelectedSubmissionIds(newSet);
  };

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const pageCount = useMemo(() => {
    if (!totalRows) return 1;
    return Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  }, [totalRows]);

  // Fixed column order for consistent table structure
  const tableColumns = useMemo<string[]>(() => {
    return [
      "checkbox",
      "created_at",
      "insured_name",
      "carrier",
      "retention_agent",
      "licensed_agent_account",
      "status",
      "monthly_premium",
      "face_amount",
      "notes",
    ];
  }, []);

  const columnWidthByKey = useMemo<Record<string, string>>(
    () => ({
      checkbox: "40px",
      created_at: "120px",
      insured_name: "240px",
      carrier: "120px",
      retention_agent: "160px",
      licensed_agent_account: "160px",
      status: "130px",
      monthly_premium: "130px",
      face_amount: "130px",
      notes: "240px",
    }),
    [],
  );

  const visibleRows = rawRows;

  return (
    <div className="w-full px-4 md:px-8 py-10 min-h-screen bg-muted/20">
      <div className="w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Retention Deal Flow</CardTitle>
            <CardDescription>Deals processed by retention agents (new sale, fix payment, etc.)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-sm text-muted-foreground">Total Records</div>
                <div className="text-2xl font-bold">{statsLoading ? "-" : stats.total}</div>
              </div>
              {Object.entries(stats.byStatus).slice(0, 3).map(([status, count]) => (
                <div key={status} className="rounded-lg border bg-card p-3">
                  <div className="text-sm text-muted-foreground truncate" title={status}>{status}</div>
                  <div className="text-2xl font-bold">{count}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Input
                placeholder="Search by name, phone, policy #, submission ID, or notes..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <MultiSelect
                  options={availableAgents}
                  selected={agentFilter}
                  onChange={(selected) => {
                    setAgentFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All Agents"
                  className="w-full lg:w-[200px]"
                  showAllOption={true}
                  allOptionLabel="All Agents"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    console.log("[DEBUG] Status filter changed to:", v);
                    setStatusFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {availableStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <MultiSelect
                  options={availableCarriers}
                  selected={carrierFilter}
                  onChange={(selected) => {
                    setCarrierFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All Carriers"
                  className="w-full lg:w-[200px]"
                  showAllOption={true}
                  allOptionLabel="All Carriers"
                />
                <Select
                  value={datePreset}
                  onValueChange={(v) => {
                    setDatePreset(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {datePresetOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {datePreset === "custom" && (
                  <>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setPage(1);
                      }}
                      className="w-[130px]"
                    />
                    <span className="text-muted-foreground text-sm">-</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setPage(1);
                      }}
                      className="w-[130px]"
                    />
                  </>
                )}
                <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={showOnlyActiveLeads}
                    onChange={(e) => {
                      setShowOnlyActiveLeads(e.target.checked);
                      setPage(1);
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Active Leads Only</span>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAgentFilter([]);
                    setStatusFilter("all");
                    setCarrierFilter([]);
                    setDatePreset("all");
                    setDateFrom("");
                    setDateTo("");
                    setSearch("");
                    setShowOnlyActiveLeads(false);
                    setPage(1);
                  }}
                  disabled={loading}
                >
                  Clear
                </Button>
              </div>
            </div>

            {selectedSubmissionIds.size > 0 && (
              <div className="flex items-center justify-between rounded-md border bg-muted/50 p-3">
                <div className="text-sm">
                  <span className="font-medium">{selectedSubmissionIds.size}</span> item(s) selected
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkUnassign}
                  disabled={unassigning}
                >
                  <UserMinus className="h-4 w-4 mr-1" />
                  {unassigning ? "Unassigning..." : "Unassign Selected"}
                </Button>
              </div>
            )}

            <div className="rounded-md border overflow-x-auto">
              {error ? (
                <div className="p-3 text-sm text-red-600">{error}</div>
              ) : loading && rawRows.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : visibleRows.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No retention deals found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse" style={{ minWidth: "1500px" }}>
                    <thead className="bg-muted/30 sticky top-0 z-10">
                      <tr>
                        {tableColumns.map((c: string) => (
                          <th
                            key={c}
                            className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap border-b"
                            style={{
                              width: columnWidthByKey[c] ?? "180px",
                              minWidth: columnWidthByKey[c] ?? "180px",
                            }}
                          >
                            {c === "checkbox" ? (
                              <input
                                type="checkbox"
                                checked={rawRows.length > 0 && selectedSubmissionIds.size === rawRows.length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 cursor-pointer"
                              />
                            ) : c === "insured_name" ? (
                              "Name / Phone"
                            ) : (
                              toTitleCaseLabel(c)
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
<tbody>
                      {visibleRows.map((r, idx) => {
                        const rowId = typeof r["id"] === "string" ? (r["id"] as string) : `row-${idx}`;
                        const submissionId = typeof r["submission_id"] === "string" ? r["submission_id"].trim() : "";
                        const isSelected = selectedSubmissionIds.has(submissionId);
                        return (
                          <tr key={rowId} className={`border-b hover:bg-muted/20 ${isSelected ? "bg-muted/40" : ""}`}>
                            {tableColumns.map((c: string) => {
                              if (c === "checkbox") {
                                return (
                                  <td
                                    key={c}
                                    className="px-3 py-2 align-top"
                                    style={{
                                      width: columnWidthByKey[c] ?? "180px",
                                      minWidth: columnWidthByKey[c] ?? "180px",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelectRow(submissionId)}
                                      className="w-4 h-4 cursor-pointer"
                                      disabled={!submissionId}
                                    />
                                  </td>
                                );
                              }
                              const v = r[c];
                              let text: string;
                              if (c === "insured_name") {
                                text = `${typeof r["insured_name"] === "string" ? (r["insured_name"] as string).trim() : ""}${
                                  typeof r["client_phone_number"] === "string" && (r["client_phone_number"] as string).trim().length
                                    ? ` | ${(r["client_phone_number"] as string).trim()}`
                                    : ""
                                }`;
                              } else if (c === "created_at" && typeof v === "string") {
                                const d = new Date(v);
                                if (!isNaN(d.getTime())) {
                                  text = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                                } else {
                                  text = v.trim();
                                }
                              } else if (v == null) {
                                text = "";
                              } else if (typeof v === "string") {
                                text = v.trim();
                              } else if (typeof v === "number") {
                                text = v.toLocaleString();
                              } else if (typeof v === "boolean") {
                                text = String(v);
                              } else {
                                text = JSON.stringify(v);
                              }
                              return (
                                <td
                                  key={c}
                                  className="px-3 py-2 align-top"
                                  style={{
                                    width: columnWidthByKey[c] ?? "180px",
                                    minWidth: columnWidthByKey[c] ?? "180px",
                                  }}
                                  title={text || undefined}
                                >
                                  <div className="truncate" title={text || undefined}>
                                    {text || "—"}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground border-t">
              <div>
                {totalRows !== null ? (
                  <>
                    Showing {rawRows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0} -{" "}
                    {Math.min(page * PAGE_SIZE, totalRows)} of {totalRows} records
                    {pageCount > 1 && ` (Page ${page} of ${pageCount})`}
                  </>
                ) : (
                  "Loading record count..."
                )}
              </div>
              {totalRows !== null && totalRows > PAGE_SIZE && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount || loading}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
