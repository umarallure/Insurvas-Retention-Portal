"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { FilterIcon, Loader2, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";

import { assignCallBackDeal, unassignCallBackDeal } from "@/lib/call-back-deals/assign";
import { CallBackBulkAssignModal } from "@/components/manager/call-back-deals/bulk-assign-modal";

type CallBackDealRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  submission_id: string;
  stage: string | null;
  stage_id: number | null;
  call_center: string | null;
  assigned: boolean;
  is_active: boolean;
  tcpa_flag: boolean;
  tcpa_message: string | null;
  assigned_to_profile_id: string | null;
  assigned_at: string | null;
  last_synced_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email?: string | null;
};

const STAGE_OPTIONS = [
  "Incomplete Transfer",
  "Application Withdrawn",
  "Needs BPO Callback",
  "Declined Underwriting",
];

const PAGE_SIZE = 25;

export default function ManagerCallBackDealsPage() {
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [rows, setRows] = useState<CallBackDealRow[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "assigned" | "unassigned">("all");

  const [agents, setAgents] = useState<ProfileRow[]>([]);
  const [assigneeNameById, setAssigneeNameById] = useState<Map<string, string>>(new Map());

  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    assigned: number;
    unassigned: number;
    byAgent: Record<string, number>;
  }>({ total: 0, assigned: 0, unassigned: 0, byAgent: {} });

  const [modalOpen, setModalOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<CallBackDealRow | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);

  const [unassignOpen, setUnassignOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [activeUnassign, setActiveUnassign] = useState<CallBackDealRow | null>(null);

  const pageCount = useMemo(() => {
    if (!totalRows) return 1;
    return Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  }, [totalRows]);

  const loadAgents = useCallback(async () => {
    const { data: raRows, error: raError } = await supabase
      .from("retention_agents")
      .select("profile_id")
      .eq("active", true);

    if (raError) {
      console.error("[manager-call-back-deals] loadAgents error", raError);
      return;
    }

    const profileIds = (raRows ?? []).map((row) => row.profile_id as string);
    if (profileIds.length === 0) {
      setAgents([]);
      return;
    }

    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);

    if (profilesError) {
      console.error("[manager-call-back-deals] loadAgents profiles error", profilesError);
      return;
    }

    const mapped: ProfileRow[] = (profileRows ?? []).map((p) => ({
      id: p.id as string,
      display_name: (p.display_name as string | null) ?? null,
    }));

    setAgents(mapped);
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [totalResult, assignedResult, unassignedResult] = await Promise.all([
        supabase.from("call_back_deals").select("*", { count: "exact", head: true }),
        supabase.from("call_back_deals").select("*", { count: "exact", head: true }).eq("assigned", true),
        supabase.from("call_back_deals").select("*", { count: "exact", head: true }).eq("assigned", false),
      ]);

      const assignedRowsResult = await supabase
        .from("call_back_deals")
        .select("assigned_to_profile_id")
        .eq("assigned", true);

      const byAgent: Record<string, number> = {};
      if (assignedRowsResult.data) {
        (assignedRowsResult.data as Array<{ assigned_to_profile_id: string | null }>).forEach((row) => {
          if (row.assigned_to_profile_id) {
            byAgent[row.assigned_to_profile_id] = (byAgent[row.assigned_to_profile_id] || 0) + 1;
          }
        });
      }

      setStats({
        total: totalResult.count ?? 0,
        assigned: assignedResult.count ?? 0,
        unassigned: unassignedResult.count ?? 0,
        byAgent,
      });
    } catch (error) {
      console.error("[manager-call-back-deals] loadStats error", error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("call_back_deals")
        .select(
          "id, name, phone_number, submission_id, stage, stage_id, call_center, assigned, is_active, tcpa_flag, tcpa_message, assigned_to_profile_id, assigned_at, last_synced_at",
          { count: "exact" },
        )
        .order("last_synced_at", { ascending: false, nullsFirst: false });

      if (stageFilter.length > 0) {
        query = query.in("stage", stageFilter);
      }

      if (statusFilter === "active") query = query.eq("is_active", true);
      else if (statusFilter === "inactive") query = query.eq("is_active", false);
      else if (statusFilter === "assigned") query = query.eq("assigned", true);
      else if (statusFilter === "unassigned") query = query.eq("assigned", false);

      const trimmed = search.trim();
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        query = query.or(
          `name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,submission_id.ilike.%${escaped}%`,
        );
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      const fetched = (data ?? []) as CallBackDealRow[];
      setRows(fetched);
      setTotalRows(count ?? null);

      const assigneeIds = Array.from(
        new Set(
          fetched
            .map((r) => r.assigned_to_profile_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      );

      if (assigneeIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", assigneeIds);
        const nameById = new Map<string, string>();
        for (const p of (profileRows ?? []) as Array<{ id: string; display_name: string | null }>) {
          nameById.set(p.id, p.display_name ?? "Unknown");
        }
        setAssigneeNameById(nameById);
      } else {
        setAssigneeNameById(new Map());
      }
    } catch (error) {
      console.error("[manager-call-back-deals] loadRows error", error);
      toastRef.current({
        title: "Failed to load",
        description: "Could not fetch call back deals. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, stageFilter, statusFilter, search]);

  useEffect(() => {
    void loadAgents();
    void loadStats();
  }, [loadAgents, loadStats]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const resp = await fetch("/api/call-back-deals/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const json = (await resp.json().catch(() => null)) as
        | { ok: true; fetched: number; upserted: number; skipped: number }
        | { ok: false; error: string }
        | null;

      if (!resp.ok || !json || !json.ok) {
        throw new Error(json && "error" in json ? json.error : `Sync failed (status ${resp.status})`);
      }

      toast({
        title: "Sync complete",
        description: `Fetched ${json.fetched} CRM leads • Upserted ${json.upserted} • Skipped ${json.skipped}`,
      });

      setPage(1);
      await loadRows();
      await loadStats();
    } catch (error) {
      console.error("[manager-call-back-deals] sync error", error);
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const openAssignModal = (row: CallBackDealRow) => {
    setActiveRow(row);
    setSelectedAgentId(row.assigned_to_profile_id ?? "");
    setModalOpen(true);
  };

  const handleConfirmAssign = async () => {
    if (!activeRow || !selectedAgentId) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { data: managerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!managerProfile?.id) throw new Error("Manager profile not found");

      const result = await assignCallBackDeal({
        callBackDealId: activeRow.id,
        assigneeProfileId: selectedAgentId,
        assignedByProfileId: managerProfile.id as string,
        phoneNumber: activeRow.phone_number,
      });

      if (result.action === "assigned") {
        toast({
          title: "Assigned",
          description: `${activeRow.name ?? "Lead"} assigned.${result.tcpa.status === "dnc" ? " (DNC flagged, proceed with consent)" : ""}`,
        });
      } else if (result.action === "tcpa_blocked") {
        toast({
          title: "TCPA detected — assignment blocked",
          description: result.tcpa.message,
          variant: "destructive",
        });
      } else {
        throw new Error(result.error);
      }

      setModalOpen(false);
      setActiveRow(null);
      setSelectedAgentId("");
      await loadRows();
      await loadStats();
    } catch (error) {
      console.error("[manager-call-back-deals] assign error", error);
      toast({
        title: "Assignment failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmUnassign = async () => {
    if (!activeUnassign) return;
    setUnassigning(true);
    try {
      const result = await unassignCallBackDeal(activeUnassign.id);
      if (!result.ok) throw new Error(result.error ?? "Unknown error");
      toast({ title: "Unassigned", description: "Removed assignment." });
      setUnassignOpen(false);
      setActiveUnassign(null);
      await loadRows();
      await loadStats();
    } catch (error) {
      toast({
        title: "Unassign failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUnassigning(false);
    }
  };

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Call Back Deals</CardTitle>
            <CardDescription>
              Synced from CRM for stages: Incomplete Transfer, Application Withdrawn, Needs BPO callback, Decline
              Underwriting. TCPA check runs at assignment time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm text-muted-foreground">Total Deals</div>
                <div className="text-2xl font-bold">{statsLoading ? "-" : stats.total}</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm text-muted-foreground">Assigned</div>
                <div className="text-2xl font-bold text-green-600">{statsLoading ? "-" : stats.assigned}</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm text-muted-foreground">Unassigned</div>
                <div className="text-2xl font-bold text-amber-600">{statsLoading ? "-" : stats.unassigned}</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm text-muted-foreground">By Agent</div>
                <div className="text-sm space-y-1 max-h-16 overflow-y-auto">
                  {statsLoading ? (
                    <div className="text-xs text-muted-foreground">Loading...</div>
                  ) : Object.keys(stats.byAgent).length === 0 ? (
                    <div className="text-xs text-muted-foreground">No assignments</div>
                  ) : (
                    Object.entries(stats.byAgent).map(([agentId, count]) => (
                      <div key={agentId} className="flex justify-between text-xs">
                        <span className="truncate">{assigneeNameById.get(agentId) ?? agentId}</span>
                        <span className="font-medium ml-2">{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Input
                placeholder="Search by name, phone, or submission ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />

              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <MultiSelect
                  options={STAGE_OPTIONS}
                  selected={stageFilter}
                  onChange={(selected) => {
                    setStageFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All Stages"
                  className="w-full lg:w-[240px]"
                  showAllOption
                  allOptionLabel="All Stages"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v as typeof statusFilter);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active only</SelectItem>
                    <SelectItem value="inactive">Inactive / TCPA</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="default"
                className="lg:ml-auto"
                onClick={handleSync}
                disabled={syncing || loading}
              >
                {syncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCwIcon className="mr-2 h-4 w-4" />
                )}
                Sync
              </Button>

              <Button
                variant="outline"
                onClick={() => setBulkOpen(true)}
                disabled={syncing || loading}
              >
                Bulk Assign
              </Button>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-[minmax(200px,2fr)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(140px,1fr)_minmax(150px,1fr)_minmax(110px,auto)_minmax(170px,auto)] gap-4 p-3 text-sm font-medium text-muted-foreground">
                <div>Name</div>
                <div>Phone</div>
                <div>Stage</div>
                <div>Call Center</div>
                <div>Assigned Agent</div>
                <div>Status</div>
                <div className="text-right">Actions</div>
              </div>

              {loading ? (
                <div className="border-t p-6 flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : rows.length === 0 ? (
                <div className="border-t p-3 text-sm text-muted-foreground">No call back deals found.</div>
              ) : (
                rows.map((row) => {
                  const assigneeName = row.assigned_to_profile_id
                    ? assigneeNameById.get(row.assigned_to_profile_id) ?? "Unknown"
                    : null;
                  const isInactive = !row.is_active;
                  return (
                    <div
                      key={row.id}
                      className={`grid grid-cols-[minmax(200px,2fr)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(140px,1fr)_minmax(150px,1fr)_minmax(110px,auto)_minmax(170px,auto)] gap-4 p-3 text-sm items-center border-t ${
                        isInactive ? "bg-red-50/40 opacity-70" : "bg-background/40"
                      }`}
                    >
                      <div className="min-w-0 truncate" title={row.name ?? undefined}>
                        <span className="font-medium">{row.name ?? "Unknown"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">#{row.submission_id}</span>
                      </div>
                      <div className="truncate">{row.phone_number ?? "-"}</div>
                      <div className="truncate">{row.stage ?? "-"}</div>
                      <div className="truncate">{row.call_center ?? "-"}</div>
                      <div className="min-w-0">
                        {assigneeName ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {assigneeName}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                      <div>
                        {row.tcpa_flag ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700"
                            title={row.tcpa_message ?? "TCPA flagged"}
                          >
                            <ShieldAlertIcon className="h-3 w-3" />
                            TCPA
                          </span>
                        ) : isInactive ? (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Inactive
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        {row.assigned ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveUnassign(row);
                              setUnassignOpen(true);
                            }}
                          >
                            Unassign
                          </Button>
                        ) : null}

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isInactive}
                          onClick={() => openAssignModal(row)}
                        >
                          {row.assigned ? "Change" : "Assign"}
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
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Call Back Deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              {activeRow ? (
                <>
                  Assigning <span className="font-medium">{activeRow.name ?? "Unknown"}</span> (Submission: {activeRow.submission_id})
                  <div className="mt-1 text-xs">Phone: {activeRow.phone_number ?? "-"}</div>
                  <div className="mt-2 text-xs text-amber-700">
                    TCPA will be checked before the assignment is saved. If the phone is flagged, the row will be marked
                    inactive and the assignment will be blocked.
                  </div>
                </>
              ) : (
                "No lead selected."
              )}
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">Retention Agent</span>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.display_name ?? agent.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleConfirmAssign} disabled={saving || !selectedAgentId}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unassignOpen} onOpenChange={setUnassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign Call Back Deal</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            {activeUnassign ? (
              <>
                Remove assignment for <span className="font-medium text-foreground">{activeUnassign.name ?? "this deal"}</span>?
              </>
            ) : (
              "No deal selected."
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnassignOpen(false)} disabled={unassigning}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmUnassign} disabled={unassigning || !activeUnassign}>
              {unassigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Unassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CallBackBulkAssignModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        agents={agents}
        onCompleted={() => {
          void loadRows();
          void loadStats();
        }}
      />
    </div>
  );
}
