import { useEffect, useCallback, useMemo, useState, useRef } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterIcon, Loader2 } from "lucide-react";

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
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [carrierFilter, setCarrierFilter] = useState<string[]>([]);
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([]);

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

      if (statusFilter.length > 0) {
        query = query.in("status", statusFilter);
      }

      if (carrierFilter.length > 0) {
        query = query.in("carrier", carrierFilter);
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

      const raw = (data ?? []) as RetentionDealFlowRow[];
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
  }, [page, debouncedSearch, agentFilter, statusFilter, carrierFilter]);

  const loadFilterOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("retention_deal_flow")
        .select("retention_agent, status, carrier")
        .not("retention_agent", "is", null);

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
    } catch (error) {
      console.error("[retention-deal-flow] loadFilterOptions error", error);
    }
  }, []);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

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
      "insured_name",
      "client_phone_number",
      "policy_number",
      "lead_vendor",
      "carrier",
      "product_type",
      "retention_agent",
      "licensed_agent_account",
      "agent",
      "buffer_agent",
      "status",
      "call_result",
      "monthly_premium",
      "face_amount",
      "notes",
    ];
  }, []);

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
                <MultiSelect
                  options={availableStatuses}
                  selected={statusFilter}
                  onChange={(selected) => {
                    setStatusFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All Statuses"
                  className="w-full lg:w-[200px]"
                  showAllOption={true}
                  allOptionLabel="All Statuses"
                />
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAgentFilter([]);
                    setStatusFilter([]);
                    setCarrierFilter([]);
                    setSearch("");
                    setPage(1);
                  }}
                  disabled={loading}
                >
                  Clear
                </Button>
              </div>
            </div>

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
                  <table className="w-full text-sm border-collapse" style={{ minWidth: "1800px" }}>
                    <thead className="bg-muted/30 sticky top-0 z-10">
                    <tr>
                        {tableColumns.map((c: string, colIdx: number) => (
                          <th
                            key={c}
                            className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap border-b"
                            style={{
                              width: colIdx === 0 ? "180px" : 
                                     colIdx === 1 ? "140px" :
                                     colIdx === 2 ? "120px" :
                                     colIdx === 3 ? "140px" :
                                     colIdx === 4 ? "100px" :
                                     colIdx === 5 ? "100px" :
                                     colIdx === 6 ? "140px" :
                                     colIdx === 7 ? "120px" :
                                     colIdx === 8 ? "100px" :
                                     colIdx === 9 ? "120px" :
                                     colIdx === 10 ? "100px" :
                                     colIdx === 11 ? "120px" :
                                     colIdx === 12 ? "100px" :
                                     colIdx === 13 ? "100px" :
                                     "200px",
                              minWidth: colIdx === 0 ? "180px" : 
                                        colIdx === 1 ? "140px" :
                                        colIdx === 2 ? "120px" :
                                        colIdx === 3 ? "140px" :
                                        colIdx === 4 ? "100px" :
                                        colIdx === 5 ? "100px" :
                                        colIdx === 6 ? "140px" :
                                        colIdx === 7 ? "120px" :
                                        colIdx === 8 ? "100px" :
                                        colIdx === 9 ? "120px" :
                                        colIdx === 10 ? "100px" :
                                        colIdx === 11 ? "120px" :
                                        colIdx === 12 ? "100px" :
                                        colIdx === 13 ? "100px" :
                                        "200px",
                            }}
                          >
                          {toTitleCaseLabel(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                      {visibleRows.map((r, idx) => {
                        const rowId = typeof r["id"] === "string" ? (r["id"] as string) : `row-${idx}`;
                        return (
                          <tr key={rowId} className="border-b hover:bg-muted/20">
                            {tableColumns.map((c: string, colIdx: number) => {
                          const v = r[c];
                          const text =
                            v == null
                              ? ""
                              : typeof v === "string"
                                    ? v.trim()
                                    : typeof v === "number"
                                      ? v.toLocaleString()
                                      : typeof v === "boolean"
                                  ? String(v)
                                  : JSON.stringify(v);
                          return (
                                <td
                                  key={c}
                                  className="px-3 py-2 align-top"
                                  style={{
                                    width: colIdx === 0 ? "180px" : 
                                           colIdx === 1 ? "140px" :
                                           colIdx === 2 ? "120px" :
                                           colIdx === 3 ? "140px" :
                                           colIdx === 4 ? "100px" :
                                           colIdx === 5 ? "100px" :
                                           colIdx === 6 ? "140px" :
                                           colIdx === 7 ? "120px" :
                                           colIdx === 8 ? "100px" :
                                           colIdx === 9 ? "120px" :
                                           colIdx === 10 ? "100px" :
                                           colIdx === 11 ? "120px" :
                                           colIdx === 12 ? "100px" :
                                           colIdx === 13 ? "100px" :
                                           "200px",
                                    minWidth: colIdx === 0 ? "180px" : 
                                              colIdx === 1 ? "140px" :
                                              colIdx === 2 ? "120px" :
                                              colIdx === 3 ? "140px" :
                                              colIdx === 4 ? "100px" :
                                              colIdx === 5 ? "100px" :
                                              colIdx === 6 ? "140px" :
                                              colIdx === 7 ? "120px" :
                                              colIdx === 8 ? "100px" :
                                              colIdx === 9 ? "120px" :
                                              colIdx === 10 ? "100px" :
                                              colIdx === 11 ? "120px" :
                                              colIdx === 12 ? "100px" :
                                              colIdx === 13 ? "100px" :
                                              "200px",
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
