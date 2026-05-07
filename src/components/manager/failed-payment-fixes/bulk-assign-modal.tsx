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

import { assignFailedPaymentFix } from "@/lib/failed-payment-fixes/assign";

type FailedPaymentFixRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  policy_number: string;
  assigned_agency: string | null;
  ghl_stage: string | null;
  carrier: string | null;
  isDq?: boolean;
};

type DualChargebackInfo = {
  name: string;
  chargebackCount: number;
};

type BulkAssignAgentOption = {
  id: string;
  display_name: string | null;
  assigned_agency: string | null;
};

type BulkAssignModalProps = {
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
  "Chargeback Cancellation",
  "Chargeback Failed Payment",
  "FDPF Incorrect Banking Info",
  "FDPF Insufficient Funds",
  "FDPF Pending Reason",
  "Pending Lapse Incorrect Banking Info",
  "Pending Lapse Insufficient Funds",
  "Pending Lapse Pending Reason",
  "Pending Lapse Unauthorized Draft",
  "Pending Manual Action",
];

const AGENCY_OPTIONS = [
  "Heritage Insurance",
  "Safe Harbor Insurance",
  "Unlimited Insurance",
];

function chunkify<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

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
    <div className="grid grid-cols-12 gap-3 items-center">
      <div className="col-span-8">
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
                {a.display_name ?? a.id} {a.assigned_agency ? `(${a.assigned_agency})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-3">
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

function PercentAllocationRow(props: {
  value: { agentId: string; percent: number };
  agents: BulkAssignAgentOption[];
  disabled?: boolean;
  onChange: (next: { agentId: string; percent: number }) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { value, agents, disabled, onChange, onRemove, canRemove } = props;
  return (
    <div className="grid grid-cols-12 gap-3 items-center">
      <div className="col-span-8">
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
                {a.display_name ?? a.id} {a.assigned_agency ? `(${a.assigned_agency})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={Number.isFinite(value.percent) ? value.percent : 0}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({
                ...value,
                percent: Number.isFinite(n) && n >= 0 ? Math.min(100, Math.floor(n)) : 0,
              });
            }}
            placeholder="Percent"
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
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

export function FailedPaymentFixBulkAssignModal(props: BulkAssignModalProps) {
  const { open, onOpenChange, agents, onCompleted } = props;
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [loadingPool, setLoadingPool] = React.useState(false);
  const [pool, setPool] = React.useState<FailedPaymentFixRow[]>([]);
  const [stageFilter, setStageFilter] = React.useState<string[]>([]);
  const [carrierFilter, setCarrierFilter] = React.useState<string[]>([]);
  const [agencyFilter, setAgencyFilter] = React.useState<string>("all");

  const [mode, setMode] = React.useState<AllocationMode>("percent");

  const [allocations, setAllocations] = React.useState<AllocationRowState[]>([
    { agentId: "", percent: 100, count: 0 },
  ]);

  const [running, setRunning] = React.useState(false);
  const [skipTcpa, setSkipTcpa] = React.useState(false);
  const [availableCarriers, setAvailableCarriers] = React.useState<string[]>([]);
  const [progress, setProgress] = React.useState<{
    done: number;
    total: number;
    assigned: number;
    tcpa: number;
    failed: number;
    dq: number;
  }>({ done: 0, total: 0, assigned: 0, tcpa: 0, failed: 0, dq: 0 });
  const [dualChargebackNames, setDualChargebackNames] = React.useState<Set<string>>(new Set());

  const loadPool = React.useCallback(async (stageFilterValue: string[], carrierFilterValue: string[], agencyFilterValue: string) => {
    setLoadingPool(true);
    try {
      let baseQuery = supabase
        .from("failed_payment_fixes")
        .select("id, name, phone_number, policy_number, assigned_agency, ghl_stage, carrier", { count: "exact" })
        .eq("is_active", true)
        .eq("assigned", false)
        .order("created_at", { ascending: false });

      if (stageFilterValue.length > 0) {
        baseQuery = baseQuery.in("ghl_stage", stageFilterValue);
      }

      if (carrierFilterValue.length > 0) {
        baseQuery = baseQuery.in("carrier", carrierFilterValue);
      }

      if (agencyFilterValue !== "all") {
        baseQuery = baseQuery.eq("assigned_agency", agencyFilterValue);
      }

      const PAGE_SIZE = 1000;
      const allData: FailedPaymentFixRow[] = [];
      let from = 0;
      let totalCount = 0;

      while (true) {
        const { data, error, count } = await baseQuery.range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        if (count !== null && totalCount === 0) {
          totalCount = count;
        }

        allData.push(...((data ?? []) as FailedPaymentFixRow[]));

        if ((data ?? []).length < PAGE_SIZE) break;
        from += PAGE_SIZE;

        if (allData.length >= totalCount && totalCount > 0) break;
      }

      setPool(allData);

      // Check for dual chargeback leads
      const nameChargebackCounts = new Map<string, number>();
      for (const deal of allData) {
        if (deal.name && deal.ghl_stage && deal.ghl_stage.toLowerCase().includes("chargeback")) {
          const nameKey = deal.name.trim().toLowerCase();
          nameChargebackCounts.set(nameKey, (nameChargebackCounts.get(nameKey) ?? 0) + 1);
        }
      }
      const dualNames = new Set<string>();
      for (const [name, count] of nameChargebackCounts) {
        if (count > 1) dualNames.add(name);
      }
      setDualChargebackNames(dualNames);
    } catch (error) {
      console.error("[failed-payment-fix-bulk-assign] pool error", error);
      toastRef.current({
        title: "Failed to load pool",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setPool([]);
    } finally {
      setLoadingPool(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void loadPool(stageFilter, carrierFilter, agencyFilter);

    // Load available carriers for filter dropdown
    const loadCarriers = async () => {
      const { data } = await supabase
        .from("failed_payment_fixes")
        .select("carrier")
        .eq("is_active", true)
        .eq("assigned", false)
        .not("carrier", "is", null);
      const carriers = new Set<string>();
      (data ?? []).forEach((row: { carrier: string | null }) => {
        if (typeof row.carrier === "string" && row.carrier.trim()) {
          carriers.add(row.carrier.trim());
        }
      });
      setAvailableCarriers(Array.from(carriers).sort());
    };
    void loadCarriers();
  }, [open, stageFilter, carrierFilter, agencyFilter]);

  const handleStageFilterChange = (selected: string[]) => {
    setStageFilter(selected);
  };

  const handleAgencyFilterChange = (value: string) => {
    setAgencyFilter(value);
  };

  const filteredAgentsByAgency = React.useMemo(() => {
    if (agencyFilter === "all") return agents;
    return agents.filter((a) => a.assigned_agency === agencyFilter);
  }, [agents, agencyFilter]);

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
      const total = allocations.reduce((acc, a) => acc + (Number.isFinite(a.percent) ? Math.max(0, a.percent) : 0), 0);
      return total === 100;
    }

    if (mode === "count") {
      return totalCount > 0 && totalCount <= pool.length;
    }

    return true;
  }, [pool.length, running, allocations, mode, totalCount]);

  const plan = React.useMemo(() => {
    if (pool.length === 0 || allocations.length === 0) return [];
    const result: Array<{ deal: FailedPaymentFixRow; assigneeProfileId: string }> = [];

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

    if (mode === "even") {
      const countPerAgent = Math.floor(pool.length / allocations.filter((a) => a.agentId).length);
      let cursor = 0;
      for (const a of allocations) {
        if (!a.agentId) continue;
        for (let i = 0; i < countPerAgent && cursor < pool.length; i += 1) {
          const deal = pool[cursor];
          if (!deal) break;
          result.push({ deal, assigneeProfileId: a.agentId });
          cursor += 1;
        }
      }
      const remaining = pool.length - cursor;
      for (let i = 0; i < remaining; i += 1) {
        const deal = pool[cursor];
        if (!deal) break;
        result.push({ deal, assigneeProfileId: allocations[i % allocations.length]?.agentId ?? "" });
        cursor += 1;
      }
      return result;
    }

    if (mode === "percent") {
      let cursor = 0;
      for (const a of allocations) {
        if (!a.agentId || !Number.isFinite(a.percent)) continue;
        const want = Math.floor(pool.length * (a.percent / 100));
        for (let i = 0; i < want && cursor < pool.length; i += 1) {
          const deal = pool[cursor];
          if (!deal) break;
          result.push({ deal, assigneeProfileId: a.agentId });
          cursor += 1;
        }
      }
      return result;
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
    let dq = 0;

    const CONCURRENCY = 25;

    for (let i = 0; i < plan.length; i += CONCURRENCY) {
      const batch = plan.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async ({ deal, assigneeProfileId }) => {
          // Skip DQ leads (dual chargeback)
          if (deal.name && dualChargebackNames.has(deal.name.trim().toLowerCase())) {
            return { action: "dq_skipped" as const };
          }
          return assignFailedPaymentFix({
            failedPaymentFixId: deal.id,
            assigneeProfileId,
            assignedByProfileId: managerProfileId,
            phoneNumber: deal.phone_number,
            skipTcpa,
          });
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value.action === "assigned") assigned += 1;
          else if (r.value.action === "tcpa_blocked") tcpa += 1;
          else if (r.value.action === "dq_skipped") dq += 1;
          else failed += 1;
        } else {
          console.error("[failed-payment-fix-bulk-assign] item error", r.reason);
          failed += 1;
        }
      }

      // Deactivate DQ leads after the batch
      const dqBatchDeals = batch.filter(b => b.deal.name && dualChargebackNames.has(b.deal.name.trim().toLowerCase()));
      if (dqBatchDeals.length > 0) {
        const dqIds = dqBatchDeals.map(b => b.deal.id);
        for (const chunk of chunkify(dqIds, 200)) {
          await supabase
            .from("failed_payment_fixes")
            .update({ is_active: false })
            .in("id", chunk);
        }
      }

      done += batch.length;
      setProgress({ done, total: plan.length, assigned, tcpa, failed, dq });
    }

    toastRef.current({
      title: "Bulk assign complete",
      description: `Assigned ${assigned} • TCPA blocked ${tcpa} • DQ deactivated ${dq} • Failed ${failed}`,
    });

    setRunning(false);
    onCompleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[90vw] !max-w-none !h-[85vh] overflow-hidden flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>Bulk Assign Failed Payment Fixes</DialogTitle>
        </DialogHeader>

        {dualChargebackNames.size > 0 && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-md">
            <div className="flex items-center gap-2">
              <span className="font-semibold">⚠️ DQ Warning:</span>
              <span>{dualChargebackNames.size} lead(s) have multiple Chargeback entries. They will be skipped and <strong>marked inactive</strong> during assignment.</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Pool: {loadingPool ? "loading…" : `${pool.length} active, unassigned failed payment fixes`}.
            {skipTcpa ? (
              <span className="text-amber-600"> TCPA check is disabled.</span>
            ) : (
              <> TCPA will be checked per deal before assignment; flagged deals will be marked inactive and skipped.</>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="skip-tcpa-fpf"
              checked={skipTcpa}
              onChange={(e) => setSkipTcpa(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="skip-tcpa-fpf" className="text-sm cursor-pointer">
              Skip TCPA Check
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Filter by Agency</span>
              <Select value={agencyFilter} onValueChange={handleAgencyFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All Agencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agencies</SelectItem>
                  {AGENCY_OPTIONS.map((agency) => (
                    <SelectItem key={agency} value={agency}>
                      {agency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Filter by Carrier</span>
              <MultiSelect
                options={availableCarriers}
                selected={carrierFilter}
                onChange={(selected) => setCarrierFilter(selected)}
                placeholder="All Carriers"
                className="w-full"
                showAllOption={true}
                allOptionLabel="All Carriers"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Filter by Stage</span>
              <MultiSelect
                options={STAGE_OPTIONS}
                selected={stageFilter}
                onChange={handleStageFilterChange}
                placeholder="All Stages"
                className="w-full"
                showAllOption={true}
                allOptionLabel="All Stages"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-4 text-sm">
            <div className="flex-1">
              <span className="font-medium">Pool Preview:</span>
              <span className="text-muted-foreground ml-2">
                {loadingPool ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                  </span>
                ) : (
                  <>Showing first 10 of <span className="font-medium">{pool.length}</span> deals</>
                )}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadPool(stageFilter, carrierFilter, agencyFilter)}
              disabled={loadingPool || running}
            >
              {loadingPool ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reload
            </Button>
          </div>

          {!loadingPool && pool.length > 0 && (
            <div className="overflow-auto border rounded-md max-h-[45vh]">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium w-[50px]">#</th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Phone</th>
                    <th className="text-left px-3 py-2 font-medium">Policy #</th>
                    <th className="text-left px-3 py-2 font-medium">Carrier</th>
                    <th className="text-left px-3 py-2 font-medium">Agency</th>
                    <th className="text-left px-3 py-2 font-medium">Stage</th>
                    <th className="text-left px-3 py-2 font-medium w-[60px]">DQ</th>
                  </tr>
                </thead>
                <tbody>
                  {pool.slice(0, 10).map((deal, idx) => {
                    const isDq = deal.name ? dualChargebackNames.has(deal.name.trim().toLowerCase()) : false;
                    return (
                    <tr key={deal.id} className={`border-t ${isDq ? "bg-red-100" : ""}`}>
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className={`px-3 py-2 ${isDq ? "text-red-600 font-semibold" : ""}`}>{deal.name ?? "-"}</td>
                      <td className="px-3 py-2">{deal.phone_number ?? "-"}</td>
                      <td className="px-3 py-2">{deal.policy_number}</td>
                      <td className="px-3 py-2">{deal.carrier ?? "-"}</td>
                      <td className="px-3 py-2">{deal.assigned_agency ?? "-"}</td>
                      <td className="px-3 py-2">{deal.ghl_stage ?? "-"}</td>
                      <td className="px-3 py-2">{isDq ? "⚠️ DQ" : "-"}</td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loadingPool && pool.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center border rounded-md">
              No unassigned deals match the selected filters.
            </div>
          )}

          <Separator />

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Allocation mode:</span>
            <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
              {(
                [
                  { id: "percent" as AllocationMode, label: "By Percent" },
                  { id: "count" as AllocationMode, label: "By Count" },
                  { id: "even" as AllocationMode, label: "Even Distribution" },
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

          <div className="text-xs text-amber-600">
            {agencyFilter !== "all" && filteredAgentsByAgency.length === 0
              ? "No agents assigned to this agency. Please assign agents to this agency first."
              : agencyFilter !== "all"
              ? `Only agents assigned to "${agencyFilter}" are shown below.`
              : null}
          </div>

          <div className="space-y-2">
            {allocations.map((a, idx) => {
              if (mode === "count") {
                return (
                  <CountAllocationRow
                    key={idx}
                    value={a}
                    agents={filteredAgentsByAgency}
                    disabled={running}
                    onChange={(next) => handleChange(idx, next)}
                    onRemove={() => handleRemove(idx)}
                    canRemove={allocations.length > 1}
                  />
                );
              }

              if (mode === "even") {
                return (
                  <div key={idx} className="grid grid-cols-12 gap-3 items-center">
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
                          {filteredAgentsByAgency.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.display_name ?? opt.id} {opt.assigned_agency ? `(${opt.assigned_agency})` : ""}
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
                <PercentAllocationRow
                  key={idx}
                  value={{ agentId: a.agentId, percent: a.percent }}
                  agents={filteredAgentsByAgency}
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
              Progress {progress.done}/{progress.total} • Assigned {progress.assigned} • TCPA {progress.tcpa} • DQ deactivated {progress.dq} • Failed {progress.failed}
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
