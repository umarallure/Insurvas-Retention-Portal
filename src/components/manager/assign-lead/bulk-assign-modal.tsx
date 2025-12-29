"use client"

import React from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus } from "lucide-react";


import { getGhlStages, type GhlStageOption } from "../../../lib/retention-assignment.logic";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  BulkAssignAllocationRow,
  type BulkAssignAgentOption,
  type BulkAssignAllocationRowValue,
} from "./bulk-assign-allocation-row";
import { computeEvenAllocationCounts } from "./bulk-assign-utils";
import {
  buildLeadIdPlan,
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

type LeadRow = {
  id: string;
  submission_id: string | null;
};

async function ensureLeadBySubmissionId(args: {
  submissionId: string;
}): Promise<string | null> {
  const { submissionId } = args;

  const { data: existing, error: existingError } = await supabase
    .from("leads")
    .select("id")
    .eq("submission_id", submissionId)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const payload: Record<string, unknown> = {
    submission_id: submissionId,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertError } = await supabase
    .from("leads")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted?.id ? (inserted.id as string) : null;
}

export function BulkAssignModal(props: BulkAssignModalProps) {
  const { toast } = useToast();
  const { open, onOpenChange, agents, onCompleted } = props;

  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [groupTitle, setGroupTitle] = React.useState<string>("");

  const [stages, setStages] = React.useState<GhlStageOption[]>([]);
  const [loadingStages, setLoadingStages] = React.useState(false);

  // multi-select stages support
  const [selectedStages, setSelectedStages] = React.useState<string[]>([]);

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
    setGroupTitle("");
    setGroupCount(null);
    setAssignedCount(0);
    setUnassignedDealIds([]);
    setAllocations([{ agentId: "", percent: 100 }]);
    setLoadingGroup(false);
    setSaving(false);
  }, []);

  React.useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const loadGroupLeads = React.useCallback(async () => {
    if (!selectedStages || selectedStages.length === 0) {
      setGroupCount(null);
      setAssignedCount(0);
      setUnassignedDealIds([]);
      return;
    }

    setLoadingGroup(true);
    try {
      let dealsQuery = supabase
        .from("monday_com_deals")
        .select("id, monday_item_id", { count: "exact" })
        .in("ghl_stage", selectedStages)
        .not("monday_item_id", "is", null)
        .order("last_updated", { ascending: false, nullsFirst: false });

      const { data: dealRows, error: dealsError, count } = await dealsQuery.limit(2000);
      if (dealsError) throw dealsError;

      setGroupCount(count ?? null);

      const dealIds = Array.from(
        new Set(((dealRows ?? []) as DealRow[]).map((d) => d.id).filter((v): v is number => !!v)),
      );

      if (dealIds.length === 0) {
        setAssignedCount(0);
        setUnassignedDealIds([]);
        return;
      }

      // We use deal ids for bulk assignment now (assignment table references deal_id)
      const dealIdsList: number[] = dealIds;

      // Check which deals are already assigned
      const { data: assignedRows, error: assignedError } = await supabase
        .from("retention_assigned_leads")
        .select("deal_id")
        .in("deal_id", dealIdsList)
        .eq("status", "active")
        .limit(10000);

      if (assignedError) throw assignedError;

      const assignedSet = new Set<number>((assignedRows ?? []).map((r) => r.deal_id as number));
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
  }, [selectedStages]);

  React.useEffect(() => {
    if (!open) return;

    // load GHL stages when modal opens
    const loadStages = async () => {
      setLoadingStages(true);
      try {
        const data = await getGhlStages();
        setStages(data);
      } catch (e) {
        console.error("[bulk-assign] load stages error", e);
      } finally {
        setLoadingStages(false);
      }
    };

    void loadStages();
    // loadGroupLeads will be called when selectedStages changes
  }, [open]);

  React.useEffect(() => {
    // whenever selected stages change, reload
    void loadGroupLeads();
  }, [selectedStages, loadGroupLeads]);

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

  const assignBulk = async () => {
    if (!canAssign) return;

    setSaving(true);
    setAssigning(true);
    try {
      const plan = buildDealIdPlan(unassignedDealIds, cleanedAllocations, evenDistribution);
      if (plan.length === 0) {
        toast({
          title: "Nothing to assign",
          description: "No deals were selected for bulk assignment.",
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
          assigned_by_profile_id: p.assignee_profile_id,
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
      }

      toast({
        title: "Bulk assignment complete",
        description: `Assigned ${assignedSoFar} leads across ${cleanedAllocations.length} agent(s).`,
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2 md:col-span-2">
              <div className="text-sm font-medium">GHL Stage(s)</div>
              <div className="rounded-md border p-2 max-h-64 overflow-auto w-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Stages</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedStages(stages.map((s) => s.stage))}>
                      Select all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedStages([])}>
                      Clear
                    </Button>
                  </div>
                </div>

                <div>
                  {loadingStages ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    stages.map((s) => (
                      <label key={s.stage} className="flex items-center justify-between p-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedStages.includes(s.stage)}
                            onCheckedChange={(c) => {
                              const checked = !!c;
                              setSelectedStages((prev) => (checked ? [...prev, s.stage] : prev.filter((x) => x !== s.stage)));
                            }}
                          />
                          <div>{s.stage}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{s.count}</div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>


          </div>

          <div className="rounded-md border bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">Selected stage summary</div>
                <div className="text-muted-foreground">
                  {loadingGroup ? (
                    <span className="inline-flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                    </span>
                  ) : selectedStages.length > 0 ? (
                    <>
                      Total leads in selected stages: <span className="font-medium">{groupCount ?? "—"}</span>
                      <span className="mx-2">•</span>
                      Already assigned: <span className="font-medium">{assignedCount}</span>
                      <span className="mx-2">•</span>
                      Unassigned: <span className="font-medium">{unassignedDealIds.length}</span>
                    </>
                  ) : (
                    "Select one or more GHL stages to load leads."
                  )}
                </div>
              </div>
              <Button variant="outline" onClick={loadGroupLeads} disabled={selectedStages.length === 0 || loadingGroup || saving}>
                {loadingGroup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reload
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
