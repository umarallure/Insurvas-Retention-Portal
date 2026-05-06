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

import { assignFailedPaymentFix, unassignFailedPaymentFix } from "@/lib/failed-payment-fixes/assign";
import { FailedPaymentFixBulkAssignModal } from "@/components/manager/failed-payment-fixes/bulk-assign-modal";
import { FailedPaymentFixBulkUnassignModal } from "@/components/manager/failed-payment-fixes/bulk-unassign-modal";

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
  ghl_name: string | null;
  ghl_stage: string | null;
  assigned_agency: string | null;
  deal_value: number | null;
  cc_value: number | null;
  call_center: string | null;
  sales_agent: string | null;
  assigned: boolean;
  is_active: boolean;
  tcpa_flag: boolean;
  tcpa_message: string | null;
  assigned_to_profile_id: string | null;
  assigned_at: string | null;
  last_synced_at: string | null;
  failure_reason: string | null;
  failure_date: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email?: string | null;
  assigned_agency: string | null;
};

const POLICY_STATUS_OPTIONS = [
  "Failed Payment",
  "Payment Due",
  "Active",
  "Cancelled",
  "Pending",
  "Expired",
];

const PAGE_SIZE = 25;

const AGENCY_OPTIONS = [
  "Heritage Insurance",
  "Safe Harbor Insurance",
  "Unlimited Insurance",
];

const TCPA_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "flagged", label: "TCPA Flagged" },
  { value: "clear", label: "TCPA Clear" },
];

const ASSIGNMENT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "assigned", label: "Assigned" },
  { value: "unassigned", label: "Unassigned" },
];

const ACTIVE_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function ManagerFailedPaymentFixesPage() {
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [rows, setRows] = useState<FailedPaymentFixRow[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [carrierFilter, setCarrierFilter] = useState<string[]>([]);
  const [ghlStageFilter, setGhlStageFilter] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [agencyFilter, setAgencyFilter] = useState<string[]>([]);
  const [tcpaFilter, setTcpaFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("active");

  const [agents, setAgents] = useState<ProfileRow[]>([]);
  const [assigneeNameById, setAssigneeNameById] = useState<Map<string, string>>(new Map());
  const [availableGhlStages, setAvailableGhlStages] = useState<string[]>([]);
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([]);

  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    assigned: number;
    unassigned: number;
    byAgent: Record<string, number>;
    byStage: Record<string, number>;
  }>({ total: 0, assigned: 0, unassigned: 0, byAgent: {}, byStage: {} });

  const [modalOpen, setModalOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<FailedPaymentFixRow | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [unassignOpen, setUnassignOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [activeUnassign, setActiveUnassign] = useState<FailedPaymentFixRow | null>(null);

  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkUnassignOpen, setBulkUnassignOpen] = useState(false);

  const pageCount = useMemo(() => {
    if (!totalRows) return 1;
    return Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  }, [totalRows]);

  const loadAgents = useCallback(async () => {
    const { data: raRows, error: raError } = await supabase
      .from("retention_agents")
      .select("profile_id, assigned_agency")
      .eq("active", true);

    if (raError) {
      console.error("[manager-failed-payment-fixes] loadAgents error", raError);
      return;
    }

    const profileIds = (raRows ?? []).map((row) => row.profile_id as string);
    const agencyByProfileId = new Map<string, string | null>();
    for (const row of raRows ?? []) {
      agencyByProfileId.set(row.profile_id, row.assigned_agency);
    }
    if (profileIds.length === 0) {
      setAgents([]);
      return;
    }

    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);

    if (profilesError) {
      console.error("[manager-failed-payment-fixes] loadAgents profiles error", profilesError);
      return;
    }

    const mapped: ProfileRow[] = (profileRows ?? []).map((p) => ({
      id: p.id as string,
      display_name: (p.display_name as string | null) ?? null,
      assigned_agency: agencyByProfileId.get(p.id) ?? null,
    }));

    setAgents(mapped);
  }, []);

  const loadFilterOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("failed_payment_fixes")
        .select("ghl_stage, carrier")
        .eq("is_active", true);

      if (error) {
        console.error("[manager-failed-payment-fixes] loadFilterOptions error", error);
        return;
      }

      const stages = new Set<string>();
      const carriers = new Set<string>();

      (data ?? []).forEach((row: { ghl_stage: string | null; carrier: string | null }) => {
        if (typeof row.ghl_stage === "string" && row.ghl_stage.trim()) {
          stages.add(row.ghl_stage.trim());
        }
        if (typeof row.carrier === "string" && row.carrier.trim()) {
          carriers.add(row.carrier.trim());
        }
      });

      setAvailableGhlStages(Array.from(stages).sort());
      setAvailableCarriers(Array.from(carriers).sort());
    } catch (error) {
      console.error("[manager-failed-payment-fixes] loadFilterOptions error", error);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const trimmed = search.trim();

      const buildBaseQuery = () => {
        let q = supabase.from("failed_payment_fixes").select("*", { count: "exact", head: true });
        if (activeFilter === "active") q = q.eq("is_active", true);
        else if (activeFilter === "inactive") q = q.eq("is_active", false);
        if (statusFilter.length > 0) q = q.in("policy_status", statusFilter);
        if (carrierFilter.length > 0) q = q.in("carrier", carrierFilter);
        if (ghlStageFilter.length > 0) q = q.in("ghl_stage", ghlStageFilter);
        if (agentFilter.length > 0) q = q.in("assigned_to_profile_id", agentFilter);
        if (assignmentFilter === "assigned") q = q.eq("assigned", true);
        else if (assignmentFilter === "unassigned") q = q.eq("assigned", false);
        if (agencyFilter.length > 0) q = q.in("assigned_agency", agencyFilter);
        if (tcpaFilter === "flagged") q = q.eq("tcpa_flag", true);
        else if (tcpaFilter === "clear") q = q.eq("tcpa_flag", false);
        if (trimmed) {
          const escaped = trimmed.replace(/,/g, "");
          q = q.or(`name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%`);
        }
        return q;
      };

      const [totalResult, assignedResult, unassignedResult] = await Promise.all([
        buildBaseQuery(),
        buildBaseQuery().eq("assigned", true),
        buildBaseQuery().eq("assigned", false),
      ]);

      // Count by GHL stage
      let stageQuery = supabase
        .from("failed_payment_fixes")
        .select("ghl_stage")
        .eq("is_active", true);

      if (statusFilter.length > 0) stageQuery = stageQuery.in("policy_status", statusFilter);
      if (carrierFilter.length > 0) stageQuery = stageQuery.in("carrier", carrierFilter);
      if (ghlStageFilter.length > 0) stageQuery = stageQuery.in("ghl_stage", ghlStageFilter);
      if (agentFilter.length > 0) stageQuery = stageQuery.in("assigned_to_profile_id", agentFilter);
      if (assignmentFilter === "assigned") stageQuery = stageQuery.eq("assigned", true);
      else if (assignmentFilter === "unassigned") stageQuery = stageQuery.eq("assigned", false);
      if (agencyFilter.length > 0) stageQuery = stageQuery.in("assigned_agency", agencyFilter);
      if (tcpaFilter === "flagged") stageQuery = stageQuery.eq("tcpa_flag", true);
      else if (tcpaFilter === "clear") stageQuery = stageQuery.eq("tcpa_flag", false);
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        stageQuery = stageQuery.or(`name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%`);
      }

      const allStageRows: Array<{ ghl_stage: string | null }> = [];
      let stageOffset = 0;
      while (true) {
        const { data } = await stageQuery.range(stageOffset, stageOffset + 1000 - 1);
        if (data) allStageRows.push(...(data as Array<{ ghl_stage: string | null }>));
        if (!data || data.length < 1000) break;
        stageOffset += 1000;
      }

      const byStage: Record<string, number> = {};
      allStageRows.forEach((row) => {
        const stage = row.ghl_stage ?? "Unknown";
        byStage[stage] = (byStage[stage] || 0) + 1;
      });

      let agentQuery = supabase
        .from("failed_payment_fixes")
        .select("assigned_to_profile_id", { count: "exact" })
        .eq("is_active", true);

      if (statusFilter.length > 0) agentQuery = agentQuery.in("policy_status", statusFilter);
      if (carrierFilter.length > 0) agentQuery = agentQuery.in("carrier", carrierFilter);
      if (ghlStageFilter.length > 0) agentQuery = agentQuery.in("ghl_stage", ghlStageFilter);
      if (agentFilter.length > 0) agentQuery = agentQuery.in("assigned_to_profile_id", agentFilter);
      if (assignmentFilter === "assigned") agentQuery = agentQuery.eq("assigned", true);
      else if (assignmentFilter === "unassigned") agentQuery = agentQuery.eq("assigned", false);
      if (agencyFilter.length > 0) agentQuery = agentQuery.in("assigned_agency", agencyFilter);
      if (tcpaFilter === "flagged") agentQuery = agentQuery.eq("tcpa_flag", true);
      else if (tcpaFilter === "clear") agentQuery = agentQuery.eq("tcpa_flag", false);
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        agentQuery = agentQuery.or(`name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%`);
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
        byStage,
      });
    } catch (error) {
      console.error("[manager-failed-payment-fixes] loadStats error", error);
    } finally {
      setStatsLoading(false);
    }
  }, [statusFilter, carrierFilter, ghlStageFilter, search, agentFilter, assignmentFilter, agencyFilter, tcpaFilter, activeFilter]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("failed_payment_fixes")
        .select(
          "id, name, phone_number, email, policy_number, carrier, policy_type, policy_status, carrier_status, ghl_name, ghl_stage, assigned_agency, deal_value, cc_value, call_center, sales_agent, assigned, is_active, tcpa_flag, tcpa_message, assigned_to_profile_id, assigned_at, last_synced_at, failure_reason, failure_date",
          { count: "exact" },
        )
        .order("created_at", { ascending: false, nullsFirst: false });

      if (activeFilter === "active") query = query.eq("is_active", true);
      else if (activeFilter === "inactive") query = query.eq("is_active", false);

      if (statusFilter.length > 0) {
        query = query.in("policy_status", statusFilter);
      }

      if (carrierFilter.length > 0) {
        query = query.in("carrier", carrierFilter);
      }

      if (ghlStageFilter.length > 0) {
        query = query.in("ghl_stage", ghlStageFilter);
      }

      if (agentFilter.length > 0) {
        query = query.in("assigned_to_profile_id", agentFilter);
      }

      if (assignmentFilter === "assigned") {
        query = query.eq("assigned", true);
      } else if (assignmentFilter === "unassigned") {
        query = query.eq("assigned", false);
      }

      if (agencyFilter.length > 0) {
        query = query.in("assigned_agency", agencyFilter);
      }

      if (tcpaFilter === "flagged") {
        query = query.eq("tcpa_flag", true);
      } else if (tcpaFilter === "clear") {
        query = query.eq("tcpa_flag", false);
      }

      const trimmed = search.trim();
      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        query = query.or(
          `name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%`,
        );
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      const fetched = (data ?? []) as FailedPaymentFixRow[];
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
      console.error("[manager-failed-payment-fixes] loadRows error", error);
      toastRef.current({
        title: "Failed to load",
        description: "Could not fetch failed payment fixes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, carrierFilter, ghlStageFilter, agentFilter, assignmentFilter, agencyFilter, tcpaFilter, search, activeFilter]);

  useEffect(() => {
    void loadAgents();
    void loadFilterOptions();
    void loadStats();
  }, [loadAgents, loadFilterOptions, loadStats]);

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

      const resp = await fetch("/api/failed-payment-fixes/sync", {
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
        description: `Fetched ${json.fetched} deals • Upserted ${json.upserted} • Skipped ${json.skipped}`,
      });

      setPage(1);
      await loadRows();
      await loadStats();
    } catch (error) {
      console.error("[manager-failed-payment-fixes] sync error", error);
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const openAssignModal = (row: FailedPaymentFixRow) => {
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

      const result = await assignFailedPaymentFix({
        failedPaymentFixId: activeRow.id,
        assigneeProfileId: selectedAgentId,
        assignedByProfileId: managerProfile.id as string,
        phoneNumber: activeRow.phone_number,
      });

      if (result.action === "assigned") {
        toast({
          title: "Assigned",
          description: `${activeRow.name ?? "Deal"} assigned.${result.tcpa.status === "dnc" ? " (DNC flagged, proceed with consent)" : ""}`,
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
      console.error("[manager-failed-payment-fixes] assign error", error);
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
      const result = await unassignFailedPaymentFix(activeUnassign.id);
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
            <CardTitle>Failed Payment Fixes</CardTitle>
            <CardDescription>
              Manage failed payment fixes. Sync from external database to pull latest records.
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
                <div className="text-2xl font-bold text-blue-600">
                  {statsLoading ? "-" : Object.keys(stats.byAgent).length}
                </div>
              </div>
            </div>

            {statsLoading ? null : Object.keys(stats.byStage).length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Stage Breakdown</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {Object.entries(stats.byStage).map(([stage, count]) => (
                    <div key={stage} className="rounded-lg border bg-card p-3">
                      <div className="text-sm font-medium truncate" title={stage}>
                        {stage}
                      </div>
                      <div className="text-2xl font-bold text-purple-600">{count}</div>
                      <div className="text-xs text-muted-foreground">deals</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {statsLoading ? null : Object.keys(stats.byAgent).length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">By Agent</div>
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
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
                No agent assignments yet
              </div>
            )}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Input
                placeholder="Search by name, phone, or policy number..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />

              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <MultiSelect
                  options={POLICY_STATUS_OPTIONS}
                  selected={statusFilter}
                  onChange={(selected) => {
                    setStatusFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All Statuses"
                  className="w-full lg:w-[200px]"
                  showAllOption
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
                  showAllOption
                  allOptionLabel="All Carriers"
                />
                <MultiSelect
                  options={availableGhlStages}
                  selected={ghlStageFilter}
                  onChange={(selected) => {
                    setGhlStageFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All GHL Stages"
                  className="w-full lg:w-[200px]"
                  showAllOption
                  allOptionLabel="All GHL Stages"
                />
                <Select
                  value={agentFilter[0] ?? "all"}
                  onValueChange={(v) => {
                    setAgentFilter(v === "all" ? [] : [v]);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[150px]">
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
                <Select
                  value={agencyFilter[0] ?? "all"}
                  onValueChange={(v) => {
                    setAgencyFilter(v === "all" ? [] : [v]);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[160px]">
                    <SelectValue placeholder="Agency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agencies</SelectItem>
                    {AGENCY_OPTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={assignmentFilter}
                  onValueChange={(v) => {
                    setAssignmentFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[150px]">
                    <SelectValue placeholder="Assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={tcpaFilter}
                  onValueChange={(v) => {
                    setTcpaFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[140px]">
                    <SelectValue placeholder="TCPA" />
                  </SelectTrigger>
                  <SelectContent>
                    {TCPA_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={activeFilter}
                  onValueChange={(v) => {
                    setActiveFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVE_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
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
                onClick={() => setBulkAssignOpen(true)}
              >
                Bulk Assign
              </Button>
              <Button
                variant="outline"
                onClick={() => setBulkUnassignOpen(true)}
              >
                Bulk Unassign
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Phone</th>
                    <th className="text-left px-3 py-2 font-medium">Policy #</th>
                    <th className="text-left px-3 py-2 font-medium">Carrier</th>
                    <th className="text-left px-3 py-2 font-medium">Agency</th>
                    <th className="text-left px-3 py-2 font-medium">GHL Stage</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Deal Value</th>
                    <th className="text-left px-3 py-2 font-medium">Agent</th>
                    <th className="text-left px-3 py-2 font-medium">TCPA</th>
                    <th className="text-right px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Loading...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-muted-foreground">
                        No failed payment fixes found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const assigneeName = row.assigned_to_profile_id
                        ? assigneeNameById.get(row.assigned_to_profile_id) ?? "Unknown"
                        : null;
                      const isInactive = !row.is_active;
                      return (
                        <tr
                          key={row.id}
                          className={`border-t ${isInactive ? "bg-red-50/40 opacity-70" : ""}`}
                        >
                          <td className="px-3 py-2 truncate max-w-[200px]">
                            {row.name ?? "Unknown"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[150px] font-mono text-xs">
                            {row.phone_number ?? "-"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[150px] font-mono text-xs">
                            {row.policy_number}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[150px]">{row.carrier ?? "-"}</td>
                          <td className="px-3 py-2 truncate max-w-[180px] text-xs">
                            {row.assigned_agency ?? "-"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[180px] text-xs">
                            {row.ghl_stage ?? "-"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[150px]">
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
                          <td className="px-3 py-2 truncate max-w-[120px]">
                            {row.deal_value != null ? `$${row.deal_value.toLocaleString()}` : "-"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[150px]">
                            {assigneeName ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                {assigneeName}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Unassigned</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.tcpa_flag ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                <ShieldAlertIcon className="h-3 w-3" />
                                TCPA
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
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
            <DialogTitle>Assign Failed Payment Fix</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              {activeRow ? (
                <>
                  Assigning <span className="font-medium">{activeRow.name ?? "Unknown"}</span> (Policy: {activeRow.policy_number})
                  <div className="mt-1 text-xs">Phone: {activeRow.phone_number ?? "-"}</div>
                  <div className="mt-1 text-xs">Carrier: {activeRow.carrier ?? "-"}</div>
                </>
              ) : (
                "No deal selected."
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
            <DialogTitle>Unassign Failed Payment Fix</DialogTitle>
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

      <FailedPaymentFixBulkAssignModal
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        agents={agents}
        onCompleted={() => {
          void loadRows();
          void loadStats();
        }}
      />

      <FailedPaymentFixBulkUnassignModal
        open={bulkUnassignOpen}
        onOpenChange={setBulkUnassignOpen}
        onCompleted={() => {
          void loadRows();
          void loadStats();
        }}
      />
    </div>
  );
}
