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
import { FilterIcon, Loader2, RefreshCwIcon, ShieldAlertIcon, Upload } from "lucide-react";

import { assignCallBackDeal, unassignCallBackDeal } from "@/lib/call-back-deals/assign";
import { CallBackBulkAssignModal } from "@/components/manager/call-back-deals/bulk-assign-modal";
import { CallBackBulkUnassignModal } from "@/components/manager/call-back-deals/bulk-unassign-modal";
import { CallBackBulkTcpaCheckModal } from "@/components/manager/call-back-deals/bulk-tcpa-check-modal";
import { UploadLeadsModal } from "@/components/manager/call-back-deals/upload-leads-modal";

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
  is_prioritized: boolean;
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
  "Needs LA Callback",
  "Declined Underwriting",
  "Internal-Leads-Never-Called",
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
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState(false);

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
  const [bulkUnassignOpen, setBulkUnassignOpen] = useState(false);
  const [bulkTcpaOpen, setBulkTcpaOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [unassignOpen, setUnassignOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [activeUnassign, setActiveUnassign] = useState<CallBackDealRow | null>(null);

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncStageFilter, setSyncStageFilter] = useState<string>("");
  const [syncProgress, setSyncProgress] = useState<{
    stageIndex: number;
    totalStages: number;
    currentStage: string;
    fetched: number;
    upserted: number;
    skipped: number;
  } | null>(null);

  const [syncCsvFile, setSyncCsvFile] = useState<File | null>(null);
  const [csvSyncing, setCsvSyncing] = useState(false);
  const [csvSyncResult, setCsvSyncResult] = useState<{
    matched: number;
    fetched: number;
    notFound: number;
    total: number;
    errors: string[];
  } | null>(null);

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
      const trimmed = search.trim();

      // Build filtered queries
      const buildBaseQuery = () => {
        let q = supabase.from("call_back_deals").select("*", { count: "exact", head: true });
        if (stageFilter.length > 0) q = q.in("stage", stageFilter);
        if (statusFilter === "active") q = q.eq("is_active", true);
        else if (statusFilter === "inactive") q = q.eq("is_active", false);
        else if (statusFilter === "assigned") q = q.eq("assigned", true);
        else if (statusFilter === "unassigned") q = q.eq("assigned", false);
        if (priorityFilter) q = q.eq("is_prioritized", true);
        if (trimmed) {
          const escaped = trimmed.replace(/,/g, "");
          q = q.or(`name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,submission_id.ilike.%${escaped}%`);
        }
        return q;
      };

      const [totalResult, assignedResult, unassignedResult] = await Promise.all([
        buildBaseQuery(),
        buildBaseQuery().eq("assigned", true),
        buildBaseQuery().eq("assigned", false),
]);

// Fetch all rows with pagination (Supabase default limit is 1000)
      let agentQuery = supabase
        .from("call_back_deals")
        .select("assigned_to_profile_id", { count: "exact" });

      if (stageFilter.length > 0) agentQuery = agentQuery.in("stage", stageFilter);
      if (statusFilter === "active") agentQuery = agentQuery.eq("is_active", true);
      else if (statusFilter === "inactive") agentQuery = agentQuery.eq("is_active", false);
      if (priorityFilter) agentQuery = agentQuery.eq("is_prioritized", true);
      if (agentFilter.length > 0) agentQuery = agentQuery.in("assigned_to_profile_id", agentFilter);
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        agentQuery = agentQuery.or(`name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,submission_id.ilike.%${escaped}%`);
      }

      const allAssignedRows: Array<{ assigned_to_profile_id: string | null }> = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let totalAgentCount = 0;

      while (true) {
        const { data, count } = await agentQuery.range(offset, offset + PAGE_SIZE - 1);
        if (data) allAssignedRows.push(...(data as Array<{ assigned_to_profile_id: string | null }>));
        if (count !== null) totalAgentCount = count;
        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      const assignedRowsResult = { data: allAssignedRows, count: totalAgentCount };

      const byAgent: Record<string, number> = {};
      const agentIds = new Set<string>();
      if (assignedRowsResult.data) {
        (assignedRowsResult.data as Array<{ assigned_to_profile_id: string | null }>).forEach((row) => {
          if (row.assigned_to_profile_id) {
            byAgent[row.assigned_to_profile_id] = (byAgent[row.assigned_to_profile_id] || 0) + 1;
            agentIds.add(row.assigned_to_profile_id);
          }
        });
      }

      // Load agent names for the stats display
      if (agentIds.size > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", Array.from(agentIds));

        const nameById = new Map<string, string>();
        for (const p of (profileRows ?? []) as Array<{ id: string; display_name: string | null }>) {
          nameById.set(p.id, p.display_name ?? "Unknown");
        }
        setAssigneeNameById((prev) => {
          const updated = new Map(prev);
          nameById.forEach((name, id) => updated.set(id, name));
          return updated;
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
  }, [stageFilter, statusFilter, search, agentFilter, priorityFilter]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("call_back_deals")
        .select(
          "id, name, phone_number, submission_id, stage, stage_id, call_center, assigned, is_active, is_prioritized, tcpa_flag, tcpa_message, assigned_to_profile_id, assigned_at, last_synced_at",
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

      if (priorityFilter) {
        query = query.eq("is_prioritized", true);
      }

      if (agentFilter.length > 0) {
        query = query.in("assigned_to_profile_id", agentFilter);
      }

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
  }, [page, stageFilter, statusFilter, search, agentFilter, priorityFilter]);

  useEffect(() => {
    void loadAgents();
    void loadStats();
  }, [loadAgents, loadStats]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const handleSync = async (stage?: string) => {
    setSyncing(true);
    setSyncModalOpen(false);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      toast({ title: "Sync failed", description: "Not authenticated", variant: "destructive" });
      setSyncing(false);
      return;
    }

    const stages = stage ? [stage] : [...STAGE_OPTIONS];
    let totalFetched = 0;
    let totalUpserted = 0;
    let totalSkipped = 0;

    try {
      for (let i = 0; i < stages.length; i++) {
        const currentStage = stages[i]!;
        setSyncProgress({
          stageIndex: i + 1,
          totalStages: stages.length,
          currentStage,
          fetched: totalFetched,
          upserted: totalUpserted,
          skipped: totalSkipped,
        });

        const resp = await fetch("/api/call-back-deals/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ stage: currentStage }),
        });
        const json = (await resp.json().catch(() => null)) as
          | { ok: true; fetched: number; upserted: number; skipped: number }
          | { ok: false; error: string }
          | null;

        if (!resp.ok || !json || !json.ok) {
          throw new Error(json && "error" in json ? json.error : `Sync failed for "${currentStage}" (status ${resp.status})`);
        }

        totalFetched += json.fetched;
        totalUpserted += json.upserted;
        totalSkipped += json.skipped;

        setSyncProgress({
          stageIndex: i + 1,
          totalStages: stages.length,
          currentStage,
          fetched: totalFetched,
          upserted: totalUpserted,
          skipped: totalSkipped,
        });
      }

      setSyncProgress(null);
      toast({
        title: "Sync complete",
        description: `Fetched ${totalFetched} • Upserted ${totalUpserted} • Skipped ${totalSkipped}`,
      });

      setPage(1);
      await loadRows();
      await loadStats();
    } catch (error) {
      console.error("[manager-call-back-deals] sync error", error);
      setSyncProgress(null);
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncCsv = async () => {
    if (!syncCsvFile) return;
    setCsvSyncing(true);
    setCsvSyncResult(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      toast({ title: "Sync failed", description: "Not authenticated", variant: "destructive" });
      setCsvSyncing(false);
      return;
    }

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1] ?? result;
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(syncCsvFile);
      });

      const resp = await fetch("/api/call-back-deals/sync-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ file: base64, fileName: syncCsvFile.name }),
      });
      const json = await resp.json().catch(() => null);

      if (!resp.ok || !json || !json.ok) {
        throw new Error(json && "error" in json ? json.error : `CSV sync failed (status ${resp.status})`);
      }

      setCsvSyncResult(json);

      toast({
        title: "CSV sync complete",
        description: `Matched ${json.matched} • Fetched ${json.fetched} • Not found ${json.notFound}`,
      });

      setSyncCsvFile(null);
      setPage(1);
      await loadRows();
      await loadStats();
    } catch (error) {
      console.error("[manager-call-back-deals] CSV sync error", error);
      toast({
        title: "CSV sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCsvSyncing(false);
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
            <CardTitle>New Sale Deals</CardTitle>
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
            </div>

            {statsLoading ? null : Object.keys(stats.byAgent).length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {Object.entries(stats.byAgent).map(([agentId, count]) => (
                  <div key={agentId} className="rounded-lg border bg-card p-3">
                    <div className="text-sm font-medium truncate" title={assigneeNameById.get(agentId) ?? agentId}>
                      {assigneeNameById.get(agentId) ?? agentId}
                    </div>
                    <div className="text-2xl font-bold text-blue-600">{count}</div>
                    <div className="text-xs text-muted-foreground">assigned deals</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
                No agent assignments yet
              </div>
            )}
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
                <Select
                  value={agentFilter[0] ?? "all"}
                  onValueChange={(v) => {
                    setAgentFilter(v === "all" ? [] : [v]);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[180px]">
                    <SelectValue placeholder="Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.display_name ?? a.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={priorityFilter}
                      onChange={(e) => {
                        setPriorityFilter(e.target.checked);
                        setPage(1);
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-muted-foreground">Prioritized</span>
                  </label>
                </div>
              </div>

              <Button
                variant="default"
                className="lg:ml-auto"
                onClick={() => setSyncModalOpen(true)}
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

              <Button
                variant="outline"
                onClick={() => setBulkUnassignOpen(true)}
                disabled={syncing || loading}
              >
                Bulk Unassign
              </Button>

              <Button
                variant="outline"
                onClick={() => setBulkTcpaOpen(true)}
                disabled={syncing || loading}
              >
                <ShieldAlertIcon className="mr-2 h-4 w-4" />
                TCPA Check
              </Button>

              <Button
                variant="outline"
                onClick={() => setUploadOpen(true)}
                disabled={syncing || loading}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Leads
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
                      <div className="flex flex-wrap gap-1">
                        {row.is_prioritized && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            Prioritized
                          </span>
                        )}
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

      <CallBackBulkUnassignModal
        open={bulkUnassignOpen}
        onOpenChange={setBulkUnassignOpen}
        onCompleted={() => {
          void loadRows();
          void loadStats();
        }}
      />

      <CallBackBulkTcpaCheckModal
        open={bulkTcpaOpen}
        onOpenChange={setBulkTcpaOpen}
        onCompleted={() => {
          void loadRows();
          void loadStats();
        }}
      />

      <UploadLeadsModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onCompleted={() => {
          void loadRows();
          void loadStats();
        }}
      />

      <Dialog open={syncModalOpen} onOpenChange={(open) => { if (!open) { setSyncCsvFile(null); setCsvSyncResult(null); } setSyncModalOpen(open); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Sync Call Back Deals</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="rounded-md border p-4 space-y-4">
              <h3 className="text-sm font-medium">Option 1: Sync by Stage</h3>
              <p className="text-sm text-muted-foreground">
                Pull leads from the CRM by stage.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Stage (optional)</label>
                <Select value={syncStageFilter} onValueChange={setSyncStageFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {STAGE_OPTIONS.filter((s) => s !== "Internal-Leads-Never-Called").map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => void handleSync(syncStageFilter === "all" || !syncStageFilter ? undefined : syncStageFilter)}
              >
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                {syncStageFilter && syncStageFilter !== "all" ? `Sync "${syncStageFilter}"` : "Sync All"}
              </Button>
            </div>

            <div className="rounded-md border p-4 space-y-4">
              <h3 className="text-sm font-medium">Option 2: Sync by CSV</h3>
              <p className="text-sm text-muted-foreground">
                Upload a CSV or Excel file with a column of submission IDs. Existing leads will be marked as prioritized, new leads will be fetched from the CRM.
              </p>
              <div
                className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => document.getElementById("csv-sync-file-input")?.click()}
              >
                <input
                  id="csv-sync-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSyncCsvFile(f);
                      setCsvSyncResult(null);
                    }
                  }}
                />
                {syncCsvFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <div className="text-sm font-medium">{syncCsvFile.name}</div>
                      <div className="text-xs text-muted-foreground">{(syncCsvFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <div className="text-sm font-medium">Click to select a file</div>
                    <div className="text-xs text-muted-foreground">.xlsx, .xls, or .csv with submission IDs</div>
                  </div>
                )}
              </div>

              {csvSyncResult && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                    CSV sync complete
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div>Total submission IDs: {csvSyncResult.total}</div>
                    <div>Matched (existing, prioritized): {csvSyncResult.matched}</div>
                    <div>Fetched from CRM: {csvSyncResult.fetched}</div>
                    <div>Not found in CRM: {csvSyncResult.notFound}</div>
                  </div>
                  {csvSyncResult.errors.length > 0 && (
                    <div className="mt-2 max-h-24 overflow-auto text-xs text-red-600 space-y-0.5">
                      {csvSyncResult.errors.slice(0, 10).map((err, idx) => (
                        <div key={idx}>{err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button
                variant="default"
                size="sm"
                onClick={() => void handleSyncCsv()}
                disabled={!syncCsvFile || csvSyncing}
              >
                {csvSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {csvSyncing ? "Syncing..." : "Sync CSV"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync progress dialog */}
      <Dialog open={syncProgress !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Syncing Call Back Deals</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {syncProgress && (
              <>
                <div className="flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{syncProgress.stageIndex} / {syncProgress.totalStages}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${(syncProgress.stageIndex / syncProgress.totalStages) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current stage</span>
                    <span className="font-medium">{syncProgress.currentStage}</span>
                  </div>
                  <div className="border-t pt-2 mt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fetched</span>
                      <span className="font-medium">{syncProgress.fetched.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Upserted</span>
                      <span className="font-medium">{syncProgress.upserted.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Skipped</span>
                      <span className="font-medium">{syncProgress.skipped.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
