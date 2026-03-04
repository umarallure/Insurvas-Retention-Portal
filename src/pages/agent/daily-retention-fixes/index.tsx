import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type RetentionDealFlowRow = Record<string, unknown>;

const PAGE_SIZE = 25;

function toLabel(key: string) {
  const overrides: Record<string, string> = {
    insured_name: "Insured Name",
    client_phone_number: "Client Phone",
    policy_number: "Policy #",
    retention_agent: "Retention Agent",
    call_result: "Call Source",
    monthly_premium: "Monthly Premium",
    created_at: "Created",
  };

  if (overrides[key]) return overrides[key];
  return key
    .replaceAll("_", " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AgentDailyRetentionFixesPage() {
  const [agentName, setAgentName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<RetentionDealFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    const loadAgent = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session?.user) {
          if (!cancelled) setAgentName(null);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        const displayName = typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
        if (!cancelled) setAgentName(displayName || null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to resolve logged-in agent";
        if (!cancelled) {
          setAgentName(null);
          setError(msg);
        }
      }
    };

    void loadAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!agentName) {
      setRows([]);
      setTotalRows(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from("retention_deal_flow")
          .select("*", { count: "exact" })
          .eq("retention_agent", agentName)
          .order("created_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false, nullsFirst: false });

        const trimmed = debouncedSearch.trim();
        if (trimmed) {
          const escaped = trimmed.replace(/,/g, "");
          query = query.or(
            `insured_name.ilike.%${escaped}%,client_phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%,submission_id.ilike.%${escaped}%,notes.ilike.%${escaped}%`,
          );
        }

        const { data, error: queryError, count } = await query.range(from, to);
        if (queryError) throw queryError;

        if (!cancelled) {
          setRows((data ?? []) as RetentionDealFlowRow[]);
          setTotalRows(count ?? null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load daily retention fixes";
        if (!cancelled) {
          setRows([]);
          setTotalRows(null);
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [agentName, debouncedSearch, page]);

  const pageCount = useMemo(() => {
    if (!totalRows) return 1;
    return Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  }, [totalRows]);

  const columns = useMemo(
    () => [
      "insured_name",
      "client_phone_number",
      "policy_number",
      "carrier",
      "status",
      "monthly_premium",
      "notes",
      "created_at",
    ],
    [],
  );

  return (
    <div className="w-full px-4 md:px-8 py-10 min-h-screen bg-muted/20">
      <div className="w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Daily Retention Fixes</CardTitle>
            <CardDescription>
              Read-only retention deal flow records for {agentName ? `agent ${agentName}` : "the logged-in agent"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              placeholder="Search by name, phone, policy #, submission ID, or notes..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />

            {!agentName && !loading && !error ? (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                Could not resolve your agent display name. Please update your profile display name.
              </div>
            ) : null}

            <div className="rounded-md border overflow-x-auto">
              {error ? (
                <div className="p-3 text-sm text-red-600">{error}</div>
              ) : loading && rows.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : rows.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No retention fixes found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse" style={{ minWidth: "1500px" }}>
                    <thead className="bg-muted/30 sticky top-0 z-10">
                      <tr>
                        {columns.map((c) => (
                          <th key={c} className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap border-b">
                            {toLabel(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const rowId = typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : `row-${idx}`;
                        return (
                          <tr key={rowId} className="border-b hover:bg-muted/20">
                            {columns.map((c) => {
                              const value = r[c];
                              const text =
                                value == null
                                  ? ""
                                  : typeof value === "string"
                                    ? value.trim()
                                    : typeof value === "number"
                                      ? value.toLocaleString()
                                      : typeof value === "boolean"
                                        ? String(value)
                                        : JSON.stringify(value);
                              return (
                                <td key={c} className="px-3 py-2 align-top" title={text || undefined}>
                                  <div className="truncate">{text || "—"}</div>
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
                    Showing {rows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0} - {Math.min(page * PAGE_SIZE, totalRows)} of {totalRows} records
                    {pageCount > 1 && ` (Page ${page} of ${pageCount})`}
                  </>
                ) : (
                  "Loading record count..."
                )}
              </div>
              {totalRows !== null && totalRows > PAGE_SIZE && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
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
