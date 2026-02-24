"use client"

import React from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus } from "lucide-react";


import { getGhlStages, type GhlStageOption } from "../../../lib/retention-assignment.logic";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  BulkAssignAllocationRow,
  type BulkAssignAgentOption,
  type BulkAssignAllocationRowValue,
} from "./bulk-assign-allocation-row";
import { computeEvenAllocationCounts } from "./bulk-assign-utils";
import {
  buildDealIdPlan,
  computeAllocationCounts,
  isValidPercentTotal,
  normalizeAllocations,
  type AllocationInput,
} from "./bulk-assign-utils";

type BulkAssignModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: BulkAssignAgentOption[];
  onCompleted?: () => void;
};

type DealRow = {
  id: number;
  monday_item_id: string | null;
};

type DealIdentityRow = {
  id: number;
  phone_number: string | null;
  ghl_name: string | null;
  deal_name: string | null;
};

export function BulkAssignModal(props: BulkAssignModalProps) {
  const { toast } = useToast();
  const { open, onOpenChange, agents, onCompleted } = props;

  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [stages, setStages] = React.useState<GhlStageOption[]>([]);
  const [loadingStages, setLoadingStages] = React.useState(false);

  // multi-select stages support
  const [selectedStages, setSelectedStages] = React.useState<string[]>([]);
  
  // carrier filter support
  const [carrierFilter, setCarrierFilter] = React.useState<string[]>([]);
  const [availableCarriers, setAvailableCarriers] = React.useState<string[]>([]);
  const [loadingCarriers, setLoadingCarriers] = React.useState(false);

  const [loadingGroup, setLoadingGroup] = React.useState(false);
  const [groupCount, setGroupCount] = React.useState<number | null>(null);
  const [assignedCount, setAssignedCount] = React.useState<number>(0);
  const [unassignedDealIds, setUnassignedDealIds] = React.useState<number[]>([]);

  const [evenDistribution, setEvenDistribution] = React.useState<boolean>(false);

  const [allocations, setAllocations] = React.useState<BulkAssignAllocationRowValue[]>([
    { agentId: "", percent: 100 },
  ]);

  const prevAllocRef = React.useRef<BulkAssignAllocationRowValue[] | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const [assignProgress, setAssignProgress] = React.useState<{ total: number; done: number }>({ total: 0, done: 0 });

  const cleanedAllocations = React.useMemo<AllocationInput[]>(
    () => normalizeAllocations(allocations),
    [allocations],
  );

  const percentTotal = React.useMemo(
    () => cleanedAllocations.reduce((acc, a) => acc + a.percent, 0),
    [cleanedAllocations],
  );

  const hasDuplicateAgents = React.useMemo(() => {
    const ids = cleanedAllocations.map((a) => a.agentId);
    return new Set(ids).size !== ids.length;
  }, [cleanedAllocations]);

  const computedCounts = React.useMemo(() => {
    if (evenDistribution) return computeEvenAllocationCounts(unassignedDealIds.length, cleanedAllocations);
    return computeAllocationCounts(unassignedDealIds.length, cleanedAllocations);
  }, [unassignedDealIds.length, cleanedAllocations, evenDistribution]);

  const canAssign =
    selectedStages.length > 0 &&
    unassignedDealIds.length > 0 &&
    cleanedAllocations.length > 0 &&
    isValidPercentTotal(cleanedAllocations) &&
    !hasDuplicateAgents &&
    !saving;

  const reset = React.useCallback(() => {
    setGroupCount(null);
    setAssignedCount(0);
    setUnassignedDealIds([]);
    setAllocations([{ agentId: "", percent: 100 }]);
    setLoadingGroup(false);
    setSaving(false);
    setCarrierFilter([]);
  }, []);

  React.useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const loadAvailableCarriers = React.useCallback(async () => {
    setLoadingCarriers(true);
    try {
      const { data, error } = await supabase
        .from("monday_com_deals")
        .select("carrier")
        .eq("is_active", true)
        .not("carrier", "is", null);

      if (error) {
        console.error("[bulk-assign] loadAvailableCarriers error", error);
        return;
      }

      const carriers = Array.from(
        new Set(
          (data ?? [])
            .map((d) => (typeof d.carrier === "string" ? d.carrier.trim() : null))
            .filter((c): c is string => c != null && c.length > 0)
        )
      ).sort();

      setAvailableCarriers(carriers);
    } catch (error) {
      console.error("[bulk-assign] loadAvailableCarriers error", error);
    } finally {
      setLoadingCarriers(false);
    }
  }, []);

  const loadGroupLeads = React.useCallback(async () => {
    if (!selectedStages || selectedStages.length === 0) {
      setGroupCount(null);
      setAssignedCount(0);
      setUnassignedDealIds([]);
      return;
    }

    setLoadingGroup(true);
    try {
      const PAGE_SIZE = 1000;
      let offset = 0;
      let countSet = false;
      const allRows: DealRow[] = [];

      while (true) {
        let dealsQuery = supabase
          .from("monday_com_deals")
          .select("id, monday_item_id", { count: "exact" })
          .in("ghl_stage", selectedStages)
          .eq("is_active", true)
          .not("monday_item_id", "is", null)
          .order("last_updated", { ascending: false, nullsFirst: false })
          .range(offset, offset + PAGE_SIZE - 1);

        // Apply carrier filter if selected
        if (carrierFilter.length > 0) {
          dealsQuery = dealsQuery.in("carrier", carrierFilter);
        }

        const { data: dealRows, error: dealsError, count } = await dealsQuery;
        if (dealsError) throw dealsError;

        if (!countSet) {
          setGroupCount(count ?? null);
          countSet = true;
        }

        const rows = (dealRows ?? []) as DealRow[];
        allRows.push(...rows);

        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;

        // Safety valve: avoid runaway loops if range isn't respected.
        if (offset > 100000) break;
      }

      const dealIds = Array.from(new Set(allRows.map((d) => d.id).filter((v): v is number => !!v)));

      if (dealIds.length === 0) {
        setAssignedCount(0);
        setUnassignedDealIds([]);
        return;
      }

      // We use deal ids for bulk assignment now (assignment table references deal_id)
      const dealIdsList: number[] = dealIds;

      // Check which deals are already assigned (chunk to avoid query-size limits)
      const assignedSet = new Set<number>();
      const CHUNK = 1000;
      for (let i = 0; i < dealIdsList.length; i += CHUNK) {
        const slice = dealIdsList.slice(i, i + CHUNK);
        const { data: assignedRows, error: assignedError } = await supabase
          .from("retention_assigned_leads")
          .select("deal_id")
          .in("deal_id", slice)
          .eq("status", "active")
          .limit(10000);

        if (assignedError) throw assignedError;

        for (const r of (assignedRows ?? []) as Array<{ deal_id?: unknown }>) {
          const id = typeof r?.deal_id === "number" ? (r.deal_id as number) : null;
          if (id != null) assignedSet.add(id);
        }
      }
      setAssignedCount(assignedSet.size);
      setUnassignedDealIds(dealIdsList.filter((id) => !assignedSet.has(id)));
    } catch (e) {
      console.error("[bulk-assign] loadGroupLeads error", e);
      toastRef.current({
        title: "Failed to load stage",
        description: "Could not load leads for the selected GHL stage.",
        variant: "destructive",
      });
      setGroupCount(null);
      setAssignedCount(0);
      setUnassignedDealIds([]);
    } finally {
      setLoadingGroup(false);
    }
  }, [selectedStages, carrierFilter]);

  const loadStages = React.useCallback(async () => {
    setLoadingStages(true);
    try {
      const data = await getGhlStages(carrierFilter.length > 0 ? carrierFilter : undefined);
      setStages(data);
    } catch (e) {
      console.error("[bulk-assign] load stages error", e);
    } finally {
      setLoadingStages(false);
    }
  }, [carrierFilter]);

  React.useEffect(() => {
    if (!open) return;

    // load GHL stages when modal opens
    void loadStages();
    void loadAvailableCarriers();
    // loadGroupLeads will be called when selectedStages or carrierFilter changes
  }, [open, loadAvailableCarriers, loadStages]);

  React.useEffect(() => {
    // whenever carrier filter changes, reload stages to update counts
    void loadStages();
  }, [carrierFilter, loadStages]);

  React.useEffect(() => {
    // whenever selected stages or carrier filter changes, reload
    void loadGroupLeads();
  }, [selectedStages, carrierFilter, loadGroupLeads]);

  const onAddAgent = () => {
    setAllocations((prev) => [...prev, { agentId: "", percent: 0 }]);
  };

  const onRemoveAgent = (idx: number) => {
    setAllocations((prev) => prev.filter((_, i) => i !== idx));
  };

  const onChangeRow = (idx: number, v: BulkAssignAllocationRowValue) => {
    setAllocations((prev) => prev.map((row, i) => (i === idx ? v : row)));
  };

  // Auto-select all agents and set equal percentages when evenDistribution is enabled
  React.useEffect(() => {
    if (evenDistribution) {
      // save previous allocations so we can restore if the toggle is turned off
      prevAllocRef.current = allocations;
      const n = agents.length;
      if (n === 0) return;
      const base = Math.floor(100 / n);
      let rem = 100 - base * n;
      const newAlloc = agents.map((a) => {
        const extra = rem > 0 ? 1 : 0;
        if (rem > 0) rem -= 1;
        return { agentId: a.id, percent: base + extra } as BulkAssignAllocationRowValue;
      });
      setAllocations(newAlloc);
    } else {
      // restore previous allocations if available
      if (prevAllocRef.current) {
        setAllocations(prevAllocRef.current);
        prevAllocRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evenDistribution]);

  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");

  const computeDuplicateKey = React.useCallback((deal: DealIdentityRow | null): string | null => {
    if (!deal) return null;
    const phone = (deal.phone_number ?? "").toString().trim();
    if (phone) return `phone:${phone}`;
    const nameRaw = (deal.ghl_name ?? deal.deal_name ?? "").toString();
    const name = normalizeName(nameRaw);
    if (name) return `name:${name.toLowerCase()}`;
    return null;
  }, []);

  const assignBulk = async () => {
    if (!canAssign) return;

    setSaving(true);
    setAssigning(true);
    try {
      // Get current manager's profile ID (the person doing the assignment)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({
          title: "Error",
          description: "Unable to identify current user. Please refresh and try again.",
          variant: "destructive",
        });
        setSaving(false);
        setAssigning(false);
        return;
      }

      const { data: managerProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (profileError || !managerProfile?.id) {
        toast({
          title: "Error",
          description: "Unable to load manager profile. Please refresh and try again.",
          variant: "destructive",
        });
        setSaving(false);
        setAssigning(false);
        return;
      }

      const managerProfileId = managerProfile.id as string;

      const basePlan = buildDealIdPlan(unassignedDealIds, cleanedAllocations, evenDistribution);
      if (basePlan.length === 0) {
        toast({
          title: "Nothing to assign",
          description: "No deals were selected for bulk assignment.",
          variant: "destructive",
        });
        setSaving(false);
        setAssigning(false);
        return;
      }

      // Option 3 (first-seen wins): for any duplicate client, whichever agent gets the first policy
      // in the bulk plan becomes the winner; all other policies for that client (even outside selected stages)
      // are assigned to that winner.
      const baseDealIds = Array.from(new Set(basePlan.map((p) => p.deal_id)));

      const { data: identityRows, error: identityErr } = await supabase
        .from("monday_com_deals")
        .select("id, phone_number, ghl_name, deal_name")
        .in("id", baseDealIds)
        .limit(10000);

      if (identityErr) throw identityErr;

      const identityById = new Map<number, DealIdentityRow>();
      for (const r of (identityRows ?? []) as DealIdentityRow[]) {
        if (typeof r?.id === "number") identityById.set(r.id, r);
      }

      // Prefetch all duplicate deal ids by phone in one request to avoid N-per-client queries.
      const phones = Array.from(
        new Set(
          Array.from(identityById.values())
            .map((r) => (r?.phone_number ?? "").toString().trim())
            .filter((v) => v.length > 0),
        ),
      );

      const phoneToDealIds = new Map<string, number[]>();
      if (phones.length) {
        const { data: phoneDupRows, error: phoneDupErr } = await supabase
          .from("monday_com_deals")
          .select("id, phone_number")
          .not("monday_item_id", "is", null)
          .in("phone_number", phones)
          .limit(10000);

        if (phoneDupErr) throw phoneDupErr;

        for (const row of (phoneDupRows ?? []) as Array<{ id?: unknown; phone_number?: unknown }>) {
          const id = typeof row?.id === "number" ? (row.id as number) : null;
          const phone = typeof row?.phone_number === "string" ? row.phone_number.trim() : "";
          if (!id || !phone) continue;
          const existing = phoneToDealIds.get(phone) ?? [];
          existing.push(id);
          phoneToDealIds.set(phone, existing);
        }
      }

      const winnerAgentByKey = new Map<string, string>();
      const duplicateDealIdsByKey = new Map<string, number[]>();

      const getAllDealIdsForKey = async (key: string): Promise<number[]> => {
        const existing = duplicateDealIdsByKey.get(key);
        if (existing) return existing;

        if (key.startsWith("phone:")) {
          const phone = key.slice("phone:".length);
          const ids = (phoneToDealIds.get(phone) ?? []).filter((v): v is number => typeof v === "number");
          duplicateDealIdsByKey.set(key, ids);
          return ids;
        }

        if (key.startsWith("name:")) {
          const name = key.slice("name:".length);
          const escaped = name.replace(/,/g, "");
          const { data, error } = await supabase
            .from("monday_com_deals")
            .select("id")
            .not("monday_item_id", "is", null)
            .or(`ghl_name.ilike.%${escaped}%,deal_name.ilike.%${escaped}%`)
            .limit(10000);
          if (error) throw error;
          const ids = (data ?? [])
            .map((d) => (typeof (d as { id?: unknown })?.id === "number" ? ((d as { id: number }).id as number) : null))
            .filter((v): v is number => v != null);
          duplicateDealIdsByKey.set(key, ids);
          return ids;
        }

        duplicateDealIdsByKey.set(key, []);
        return [];
      };

      const finalAssignments = new Map<number, string>();

      for (const p of basePlan) {
        const dealIdentity = identityById.get(p.deal_id) ?? null;
        const key = computeDuplicateKey(dealIdentity);

        if (!key) {
          finalAssignments.set(p.deal_id, p.assignee_profile_id);
          continue;
        }

        const winner = winnerAgentByKey.get(key) ?? p.assignee_profile_id;
        if (!winnerAgentByKey.has(key)) winnerAgentByKey.set(key, winner);

        // Ensure this planned deal goes to the winner agent.
        finalAssignments.set(p.deal_id, winner);

        // Also include all other deals for this key (same client) to the same winner.
        const allIdsForKey = await getAllDealIdsForKey(key);
        for (const id of allIdsForKey) {
          if (!finalAssignments.has(id)) finalAssignments.set(id, winner);
        }
      }

      const finalDealIds = Array.from(finalAssignments.keys());

      const { data: existingAssignedRows, error: existingAssignedErr } = await supabase
        .from("retention_assigned_leads")
        .select("deal_id, assignee_profile_id, status")
        .in("deal_id", finalDealIds)
        .limit(10000);
      if (existingAssignedErr) throw existingAssignedErr;

      const existingActiveByDealId = new Map<number, { assignee_profile_id: string; status: string }>();
      for (const r of (existingAssignedRows ?? []) as Array<Record<string, unknown>>) {
        const dealId = typeof r.deal_id === "number" ? (r.deal_id as number) : null;
        const assignee = typeof r.assignee_profile_id === "string" ? (r.assignee_profile_id as string) : null;
        const status = typeof r.status === "string" ? (r.status as string) : "";
        if (dealId != null && assignee) existingActiveByDealId.set(dealId, { assignee_profile_id: assignee, status });
      }

      // Build final insert plan, skipping conflicts with already-active assignments.
      let skippedAlreadyAssignedToOther = 0;
      const plan = finalDealIds
        .map((dealId) => {
          const desiredAssignee = finalAssignments.get(dealId) ?? null;
          if (!desiredAssignee) return null;

          const existing = existingActiveByDealId.get(dealId) ?? null;
          if (existing && existing.status === "active" && existing.assignee_profile_id !== desiredAssignee) {
            skippedAlreadyAssignedToOther += 1;
            return null;
          }

          if (existing && existing.status === "active" && existing.assignee_profile_id === desiredAssignee) {
            // already correctly assigned
            return null;
          }

          return { deal_id: dealId, assignee_profile_id: desiredAssignee };
        })
        .filter((v): v is { deal_id: number; assignee_profile_id: string } => !!v);

      if (plan.length === 0) {
        toast({
          title: "Nothing to assign",
          description: skippedAlreadyAssignedToOther
            ? `All matching policies are already assigned (skipped ${skippedAlreadyAssignedToOther} assigned to other agent(s)).`
            : "All matching policies are already assigned.",
          variant: "destructive",
        });
        return;
      }

      const BATCH_SIZE = 500; // tune as needed
      const batches = chunkArray(plan, BATCH_SIZE);

      setAssignProgress({ total: plan.length, done: 0 });

      const now = new Date().toISOString();

      let assignedSoFar = 0;

      for (let b = 0; b < batches.length; b += 1) {
        const batch = batches[b];
        // prepare payload for batch insert
        const payload = batch.map((p) => ({
          deal_id: p.deal_id,
          assignee_profile_id: p.assignee_profile_id,
          assigned_by_profile_id: managerProfileId, // Manager who is doing the assignment
          status: "active",
          assigned_at: now,
        }));

        // retry logic per batch
        const MAX_RETRIES = 3;
        let attempt = 0;
        let success = false;
        let lastError: unknown = null;

        while (attempt < MAX_RETRIES && !success) {
          attempt += 1;
          const { error } = await supabase.from("retention_assigned_leads").insert(payload);
          if (!error) {
            success = true;
            assignedSoFar += payload.length;
            setAssignProgress({ total: plan.length, done: assignedSoFar });
          } else {
            lastError = error;
            console.warn(`[bulk-assign] batch insert attempt ${attempt} failed`, error);
            // small backoff
            await new Promise((r) => setTimeout(r, 200 * attempt));
          }
        }

        if (!success) {
          throw lastError;
        }

        // Sync contacts to VICIdial (non-blocking, in background)
        // Get phone numbers and names for this batch
        const batchDealIds = batch.map((p) => p.deal_id);
        const batchIdentities = batchDealIds
          .map((dealId) => {
            const identity = identityById.get(dealId);
            const assignee = finalAssignments.get(dealId);
            if (!identity || !assignee) return null;
            return { identity, assignee };
          })
          .filter((v): v is { identity: DealIdentityRow; assignee: string } => !!v);

        // Add to VICIdial in parallel (don't await - fire and forget)
        for (const { identity, assignee } of batchIdentities) {
          if (identity.phone_number && identity.phone_number.trim()) {
            const fullName = identity.ghl_name || identity.deal_name || "";
            // Fire and forget - don't block assignment
            fetch("/api/vicidial/add-lead", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                phone_number: identity.phone_number,
                full_name: fullName,
                agent_profile_id: assignee,
                vendor_lead_code: identity.id,
                comments: "Bulk assigned from Retention Portal",
              }),
            }).catch((err) => {
              console.warn("[VICIdial] Failed to sync lead in bulk:", err);
            });
          }
        }
      }

      toast({
        title: "Bulk assignment complete",
        description:
          `Assigned ${assignedSoFar} lead(s) across ${cleanedAllocations.length} agent(s).` +
          (finalDealIds.length > baseDealIds.length
            ? ` • Auto-included ${finalDealIds.length - baseDealIds.length} duplicate policy(s)`
            : "") +
          (skippedAlreadyAssignedToOther ? ` • Skipped ${skippedAlreadyAssignedToOther} already assigned` : ""),
      });

      // small delay for UX so user sees 100%
      await new Promise((res) => setTimeout(res, 300));

      // refresh counts for UI
      void loadGroupLeads();

      onOpenChange(false);
      onCompleted?.();
    } catch (e) {
      console.error("[bulk-assign] assignBulk error", e);
      toast({
        title: "Bulk assignment failed",
        description: "Could not assign leads in bulk. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setAssigning(false);
      setAssignProgress({ total: 0, done: 0 });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Bulk Assign Leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Carrier(s)</div>
              <MultiSelect
                options={availableCarriers}
                selected={carrierFilter}
                onChange={(selected) => {
                  setCarrierFilter(selected);
                }}
                placeholder={loadingCarriers ? "Loading carriers..." : "All Carriers"}
                className="w-full"
                showAllOption={true}
                allOptionLabel="All Carriers"
                disabled={loadingCarriers}
              />
              {carrierFilter.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {carrierFilter.length} carrier{carrierFilter.length !== 1 ? "s" : ""} selected
                </div>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">GHL Stage(s)</div>
                {loadingStages && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Updating counts...
                  </div>
                )}
              </div>
              <div className="rounded-md border bg-card p-3 max-h-64 overflow-auto w-full">
                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                  <div className="text-sm font-semibold">Available Stages</div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setSelectedStages(stages.map((s) => s.stage))}
                      disabled={loadingStages || stages.length === 0}
                    >
                      Select all
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setSelectedStages([])}
                      disabled={loadingStages}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div>
                  {loadingStages ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <div className="text-xs text-muted-foreground">Loading stages...</div>
                      </div>
                    </div>
                  ) : stages.length === 0 ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="text-sm text-muted-foreground text-center">
                        {carrierFilter.length > 0 
                          ? "No stages found for selected carriers" 
                          : "No stages available"}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {stages.map((s) => (
                        <label 
                          key={s.stage} 
                          className="flex items-center justify-between p-2.5 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Checkbox
                              checked={selectedStages.includes(s.stage)}
                              onCheckedChange={(c) => {
                                const checked = !!c;
                                setSelectedStages((prev) => (checked ? [...prev, s.stage] : prev.filter((x) => x !== s.stage)));
                              }}
                              disabled={loadingStages}
                            />
                            <div className="text-sm truncate flex-1">{s.stage}</div>
                          </div>
                          <div className="ml-3 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold whitespace-nowrap">
                            {s.count.toLocaleString()}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>


          </div>

          <div className="rounded-md border bg-gradient-to-r from-muted/20 to-muted/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm font-semibold mb-1">Selection Summary</div>
                <div className="text-sm text-muted-foreground">
                  {loadingGroup ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> 
                      <span>Loading leads...</span>
                    </span>
                  ) : selectedStages.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Total in stages:</span>
                        <span className="font-semibold text-foreground">{groupCount?.toLocaleString() ?? "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Already assigned:</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-500">{assignedCount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Available:</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-500">{unassignedDealIds.length.toLocaleString()}</span>
                      </div>
                      {carrierFilter.length > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">(filtered by {carrierFilter.length} carrier{carrierFilter.length !== 1 ? "s" : ""})</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      Select one or more GHL stages to load leads.
                      {carrierFilter.length > 0 && " Carrier filter is active."}
                    </div>
                  )}
                </div>
              </div>
              <Button 
                variant="outline" 
                onClick={loadGroupLeads} 
                disabled={selectedStages.length === 0 || loadingGroup || saving}
                className="shrink-0"
              >
                {loadingGroup ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Reload"
                )}
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Agent allocation</div>
                <div className="text-xs text-muted-foreground">
                  Percentages can total up to 100%. Only that portion of unassigned leads will be assigned.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={evenDistribution} onCheckedChange={(v) => setEvenDistribution(!!v)} />
                  <div className="text-xs text-muted-foreground">Evenly distribute deals across agents</div>
                </div>
                <Button variant="outline" onClick={onAddAgent} disabled={saving || evenDistribution}>
                  <Plus className="mr-2 h-4 w-4" /> Add agent
                </Button>
              </div>
            </div>

            <div className="space-y-2">
                      {allocations.map((row, idx) => (
                <BulkAssignAllocationRow
                  key={idx}
                  value={row}
                  agents={agents}
                  disabled={saving || evenDistribution}
                  canRemove={allocations.length > 1}
                  onRemove={() => onRemoveAgent(idx)}
                  onChange={(v) => onChangeRow(idx, v)}
                />
              ))}
            </div>

            <div className="rounded-md border p-3 bg-background">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Total</div>
                <div className={"text-sm " + (isValidPercentTotal(cleanedAllocations) ? "text-emerald-700" : "text-destructive")}>
                  {percentTotal}%
                </div>
              </div>
              {hasDuplicateAgents ? (
                <div className="text-xs text-destructive mt-2">Each agent can only be added once.</div>
              ) : null}
              {!isValidPercentTotal(cleanedAllocations) ? (
                <div className="text-xs text-destructive mt-2">Total percentage must be between 1% and 100%.</div>
              ) : null}

              {unassignedDealIds.length > 0 && cleanedAllocations.length > 0 ? (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {computedCounts.map((c) => {
                    const agent = agents.find((a) => a.id === c.agentId);
                    return (
                      <div key={c.agentId} className="flex items-center justify-between rounded border px-2 py-1">
                        <div className="truncate">{agent?.display_name ?? c.agentId}</div>
                        <div className="ml-2 text-foreground font-medium">{c.count}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {evenDistribution ? (
                <div className="text-xs text-muted-foreground mt-2">Deals are evenly distributed across agents; percentages are disabled.</div>
              ) : null}

              {assigning ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>Assigning {assignProgress.done} / {assignProgress.total}</div>
                    <div>{assignProgress.total > 0 ? Math.round((assignProgress.done / assignProgress.total) * 100) : 0}%</div>
                  </div>
                  <div className="w-full bg-muted rounded h-2 mt-2">
                    <div className="h-2 bg-emerald-500 rounded" style={{ width: `${assignProgress.total > 0 ? (assignProgress.done / assignProgress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={assignBulk} disabled={!canAssign || assigning}>
            {assigning || saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {assigning ? "Assigning..." : "Bulk Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
