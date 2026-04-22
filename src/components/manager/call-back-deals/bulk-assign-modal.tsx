"use client";

import React from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus, X } from "lucide-react";

import {
  BulkAssignAllocationRow,
  type BulkAssignAgentOption,
} from "@/components/manager/assign-lead/bulk-assign-allocation-row";
import {
  computeAllocationCounts,
  computeEvenAllocationCounts,
  isValidPercentTotal,
  normalizeAllocations,
} from "@/components/manager/assign-lead/bulk-assign-utils";
import { assignCallBackDeal } from "@/lib/call-back-deals/assign";

type CallBackDealRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  submission_id: string;
};

type CallBackBulkAssignModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: BulkAssignAgentOption[];
  onCompleted?: () => void;
};

type AllocationMode = "percent" | "even" | "count";

type AllocationRowState = {
  agentId: string;
  percent: number;
  count: number;
};

const STAGE_OPTIONS = [
  "Incomplete Transfer",
  "Application Withdrawn",
  "Needs BPO Callback",
  "Declined Underwriting",
];

function CountAllocationRow(props: {
  value: AllocationRowState;
  agents: BulkAssignAgentOption[];
  disabled?: boolean;
  onChange: (next: AllocationRowState) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { value, agents, disabled, onChange, onRemove, canRemove } = props;
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-7">
        <Select
          value={value.agentId}
          onValueChange={(v) => onChange({ ...value, agentId: v })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select retention agent" />
          </SelectTrigger>
          <SelectContent position="popper">
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.display_name ?? a.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-4">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={Number.isFinite(value.count) ? value.count : 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({
              ...value,
              count: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
            });
          }}
          placeholder="Deals"
          disabled={disabled}
        />
      </div>

      <div className="col-span-1 flex justify-end">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          disabled={disabled || !canRemove}
          aria-label="Remove"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function CallBackBulkAssignModal(props: CallBackBulkAssignModalProps) {
  const { open, onOpenChange, agents, onCompleted } = props;
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [loadingPool, setLoadingPool] = React.useState(false);
  const [pool, setPool] = React.useState<CallBackDealRow[]>([]);
  const [stageFilter, setStageFilter] = React.useState<string[]>([]);

  const [mode, setMode] = React.useState<AllocationMode>("percent");

  const [allocations, setAllocations] = React.useState<AllocationRowState[]>([
    { agentId: "", percent: 100, count: 0 },
  ]);

  const [running, setRunning] = React.useState(false);
  const [skipTcpa, setSkipTcpa] = React.useState(false);
  const [progress, setProgress] = React.useState<{
    done: number;
    total: number;
    assigned: number;
    tcpa: number;
    failed: number;
  }>({ done: 0, total: 0, assigned: 0, tcpa: 0, failed: 0 });

  const loadPool = React.useCallback(async () => {
    setLoadingPool(true);
    try {
      let baseQuery = supabase
        .from("call_back_deals")
        .select("id, name, phone_number, submission_id", { count: "exact" })
        .eq("is_active", true)
        .eq("assigned", false)
        .order("last_synced_at", { ascending: false, nullsFirst: false });

      if (stageFilter.length > 0) {
        baseQuery = baseQuery.in("stage", stageFilter);
      }

      const PAGE_SIZE = 1000;
      const allData: CallBackDealRow[] = [];
      let from = 0;
      let totalCount = 0;

      while (true) {
        const { data, error, count } = await baseQuery.range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        if (count !== null && totalCount === 0) {
          totalCount = count;
        }

        allData.push(...((data ?? []) as CallBackDealRow[]));

        if ((data ?? []).length < PAGE_SIZE) break;
        from += PAGE_SIZE;

        if (allData.length >= totalCount && totalCount > 0) break;
      }

      setPool(allData);
    } catch (error) {
      console.error("[cbd-bulk-assign] pool error", error);
      toastRef.current({
        title: "Failed to load pool",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setPool([]);
    } finally {
      setLoadingPool(false);
    }
  }, [stageFilter]);

  React.useEffect(() => {
    if (!open) return;
    setStageFilter([]);
    setMode("percent");
    setAllocations([{ agentId: "", percent: 100, count: 0 }]);
    setProgress({ done: 0, total: 0, assigned: 0, tcpa: 0, failed: 0 });
    setSkipTcpa(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    void loadPool();
  }, [open, stageFilter, loadPool]);

  const totalCount = React.useMemo(
    () => allocations.reduce((acc, a) => acc + (Number.isFinite(a.count) ? Math.max(0, Math.floor(a.count)) : 0), 0),
    [allocations],
  );

  const canRun = React.useMemo(() => {
    if (pool.length === 0) return false;
    if (running) return false;
    if (allocations.length === 0) return false;
    const hasAllAgents = allocations.every((a) => !!a.agentId);
    if (!hasAllAgents) return false;

    if (mode === "percent") {
      const normalized = normalizeAllocations(
        allocations.map((a) => ({ agentId: a.agentId, percent: a.percent })),
      );
      return isValidPercentTotal(normalized);
    }

    if (mode === "count") {
      return totalCount > 0 && totalCount <= pool.length;
    }

    // even
    return true;
  }, [pool.length, running, allocations, mode, totalCount]);

  const plan = React.useMemo(() => {
    if (pool.length === 0 || allocations.length === 0) return [];
    const result: Array<{ deal: CallBackDealRow; assigneeProfileId: string }> = [];

    if (mode === "count") {
      let cursor = 0;
      for (const a of allocations) {
        if (!a.agentId) continue;
        const want = Math.max(0, Math.min(Math.floor(a.count), pool.length - cursor));
        for (let i = 0; i < want; i += 1) {
          const deal = pool[cursor];
          if (!deal) break;
          result.push({ deal, assigneeProfileId: a.agentId });
          cursor += 1;
        }
        if (cursor >= pool.length) break;
      }
      return result;
    }

    const normalized = normalizeAllocations(
      allocations.map((a) => ({ agentId: a.agentId, percent: a.percent })),
    );
    const computed =
      mode === "even"
        ? computeEvenAllocationCounts(pool.length, normalized)
        : computeAllocationCounts(pool.length, normalized);

    let cursor = 0;
    for (const a of computed) {
      for (let i = 0; i < a.count; i += 1) {
        const deal = pool[cursor];
        if (!deal) break;
        result.push({ deal, assigneeProfileId: a.agentId });
        cursor += 1;
      }
    }
    return result;
  }, [pool, allocations, mode]);

  const handleAdd = () => {
    setAllocations((prev) => [...prev, { agentId: "", percent: 0, count: 0 }]);
  };

  const handleChange = (idx: number, next: AllocationRowState) => {
    setAllocations((prev) => prev.map((a, i) => (i === idx ? next : a)));
  };

  const handleRemove = (idx: number) => {
    setAllocations((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRun = async () => {
    if (!canRun) return;
    setRunning(true);
    setProgress({ done: 0, total: plan.length, assigned: 0, tcpa: 0, failed: 0 });

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    if (!userId) {
      toastRef.current({ title: "Not authenticated", variant: "destructive" });
      setRunning(false);
      return;
    }

    const { data: managerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const managerProfileId = managerProfile?.id as string | undefined;
    if (!managerProfileId) {
      toastRef.current({ title: "Manager profile not found", variant: "destructive" });
      setRunning(false);
      return;
    }

    let assigned = 0;
    let tcpa = 0;
    let failed = 0;
    let done = 0;

    const CONCURRENCY = 25;

    for (let i = 0; i < plan.length; i += CONCURRENCY) {
      const batch = plan.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(({ deal, assigneeProfileId }) =>
          assignCallBackDeal({
            callBackDealId: deal.id,
            assigneeProfileId,
            assignedByProfileId: managerProfileId,
            phoneNumber: deal.phone_number,
            skipTcpa,
          }),
        ),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value.action === "assigned") assigned += 1;
          else if (r.value.action === "tcpa_blocked") tcpa += 1;
          else failed += 1;
        } else {
          console.error("[cbd-bulk-assign] item error", r.reason);
          failed += 1;
        }
      }

      done += batch.length;
      setProgress({ done, total: plan.length, assigned, tcpa, failed });
    }

    toastRef.current({
      title: "Bulk assign complete",
      description: `Assigned ${assigned} • TCPA blocked ${tcpa} • Failed ${failed}`,
    });

    setRunning(false);
    onCompleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Assign Call Back Deals</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Pool: {loadingPool ? "loading…" : `${pool.length} active, unassigned call back deals`}.
            {skipTcpa ? (
              <span className="text-amber-600"> TCPA check is disabled.</span>
            ) : (
              <> TCPA will be checked per deal before assignment; flagged deals will be marked inactive and skipped.</>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="skip-tcpa"
              checked={skipTcpa}
              onChange={(e) => setSkipTcpa(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="skip-tcpa" className="text-sm cursor-pointer">
              Skip TCPA Check
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter by Stage:</span>
            <MultiSelect
              options={STAGE_OPTIONS}
              selected={stageFilter}
              onChange={(selected) => {
                setStageFilter(selected);
              }}
              placeholder="All Stages"
              className="w-full lg:w-[300px]"
              showAllOption={true}
              allOptionLabel="All Stages"
            />
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Allocation mode:</span>
            <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
              {(
                [
                  { id: "percent", label: "By Percent" },
                  { id: "count", label: "By Count" },
                  { id: "even", label: "Even Distribution" },
                ] as Array<{ id: AllocationMode; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={running}
                  onClick={() => setMode(opt.id)}
                  className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                    mode === opt.id
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {allocations.map((a, idx) => {
              if (mode === "count") {
                return (
                  <CountAllocationRow
                    key={idx}
                    value={a}
                    agents={agents}
                    disabled={running}
                    onChange={(next) => handleChange(idx, next)}
                    onRemove={() => handleRemove(idx)}
                    canRemove={allocations.length > 1}
                  />
                );
              }

              if (mode === "even") {
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-11">
                      <Select
                        value={a.agentId}
                        onValueChange={(v) => handleChange(idx, { ...a, agentId: v })}
                        disabled={running}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select retention agent" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {agents.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.display_name ?? opt.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemove(idx)}
                        disabled={running || allocations.length <= 1}
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <BulkAssignAllocationRow
                  key={idx}
                  value={{ agentId: a.agentId, percent: a.percent }}
                  agents={agents}
                  disabled={running}
                  onChange={(next) => handleChange(idx, { ...a, agentId: next.agentId, percent: next.percent })}
                  onRemove={() => handleRemove(idx)}
                  canRemove={allocations.length > 1}
                />
              );
            })}

            <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={running}>
              <Plus className="mr-1 h-4 w-4" /> Add agent
            </Button>
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground">
            Plan: {plan.length} of {pool.length} deals will be processed.
            {mode === "count" ? (
              <>
                {" "}
                (Requested {totalCount}
                {totalCount > pool.length ? ` — capped at pool size ${pool.length}` : ""})
              </>
            ) : null}
          </div>

          {running || progress.total > 0 ? (
            <div className="text-xs text-muted-foreground">
              Progress {progress.done}/{progress.total} • Assigned {progress.assigned} • TCPA {progress.tcpa} • Failed{" "}
              {progress.failed}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Close
          </Button>
          <Button onClick={handleRun} disabled={!canRun}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Run Bulk Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
