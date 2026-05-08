"use client";

import React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { checkTcpaStatus } from "@/lib/failed-payment-fixes/tcpa";

type PoolRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  policy_number: string;
  carrier: string | null;
  assigned_agency: string | null;
  ghl_stage: string | null;
};

type BulkTcpaCheckModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
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

const POLICY_STATUS_OPTIONS = [
  "Failed Payment",
  "Payment Due",
  "Active",
  "Cancelled",
  "Pending",
  "Expired",
];

const ASSIGNED_OPTIONS = [
  { value: "all", label: "All" },
  { value: "assigned", label: "Assigned" },
  { value: "unassigned", label: "Unassigned" },
];

const ACTIVE_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function FailedPaymentFixBulkTcpaCheckModal(props: BulkTcpaCheckModalProps) {
  const { open, onOpenChange, onCompleted } = props;
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [loadingPool, setLoadingPool] = React.useState(false);
  const [pool, setPool] = React.useState<PoolRow[]>([]);
  const [poolCount, setPoolCount] = React.useState<number | null>(null);
  const [stageFilter, setStageFilter] = React.useState<string[]>([]);
  const [carrierFilter, setCarrierFilter] = React.useState<string[]>([]);
  const [agencyFilter, setAgencyFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string[]>([]);
  const [assignedFilter, setAssignedFilter] = React.useState<string>("all");
  const [activeStatusFilter, setActiveStatusFilter] = React.useState<string>("all");

  const [running, setRunning] = React.useState(false);
  const [availableCarriers, setAvailableCarriers] = React.useState<string[]>([]);
  const [progress, setProgress] = React.useState<{
    done: number;
    total: number;
    tcpa: number;
    clear: number;
    errors: number;
  }>({ done: 0, total: 0, tcpa: 0, clear: 0, errors: 0 });

  const loadPool = React.useCallback(async () => {
    setLoadingPool(true);
    try {
      let countQuery = supabase
        .from("failed_payment_fixes")
        .select("id", { count: "exact", head: true })
        .eq("tcpa_flag", false)
        .or("tcpa_checked_at.is.null,tcpa_checked_at.eq.1990-01-01");

      if (stageFilter.length > 0) countQuery = countQuery.in("ghl_stage", stageFilter);
      if (carrierFilter.length > 0) countQuery = countQuery.in("carrier", carrierFilter);
      if (agencyFilter !== "all") countQuery = countQuery.eq("assigned_agency", agencyFilter);
      if (statusFilter.length > 0) countQuery = countQuery.in("policy_status", statusFilter);
      if (assignedFilter === "assigned") countQuery = countQuery.eq("assigned", true);
      else if (assignedFilter === "unassigned") countQuery = countQuery.eq("assigned", false);
      if (activeStatusFilter === "active") countQuery = countQuery.eq("is_active", true);
      else if (activeStatusFilter === "inactive") countQuery = countQuery.eq("is_active", false);

      const { count: totalCount } = await countQuery;
      setPoolCount(totalCount ?? 0);

      let dataQuery = supabase
        .from("failed_payment_fixes")
        .select("id, name, phone_number, policy_number, carrier, assigned_agency, ghl_stage")
        .eq("tcpa_flag", false)
        .or("tcpa_checked_at.is.null,tcpa_checked_at.eq.1990-01-01");

      if (stageFilter.length > 0) dataQuery = dataQuery.in("ghl_stage", stageFilter);
      if (carrierFilter.length > 0) dataQuery = dataQuery.in("carrier", carrierFilter);
      if (agencyFilter !== "all") dataQuery = dataQuery.eq("assigned_agency", agencyFilter);
      if (statusFilter.length > 0) dataQuery = dataQuery.in("policy_status", statusFilter);
      if (assignedFilter === "assigned") dataQuery = dataQuery.eq("assigned", true);
      else if (assignedFilter === "unassigned") dataQuery = dataQuery.eq("assigned", false);
      if (activeStatusFilter === "active") dataQuery = dataQuery.eq("is_active", true);
      else if (activeStatusFilter === "inactive") dataQuery = dataQuery.eq("is_active", false);

      const { data, error } = await dataQuery.limit(10);
      if (error) throw error;
      setPool((data ?? []) as PoolRow[]);
    } catch (error) {
      toastRef.current({
        title: "Failed to load pool",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingPool(false);
    }
  }, [stageFilter, carrierFilter, agencyFilter, statusFilter, assignedFilter, activeStatusFilter]);

  React.useEffect(() => {
    if (!open) return;
    void loadPool();

    const loadCarriers = async () => {
      const { data } = await supabase
        .from("failed_payment_fixes")
        .select("carrier")
        .eq("tcpa_flag", false)
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
  }, [open, loadPool]);

  const handleRun = async () => {
    if (poolCount === null || poolCount === 0 || running) return;
    setRunning(true);
    setProgress({ done: 0, total: poolCount, tcpa: 0, clear: 0, errors: 0 });

    let query = supabase
      .from("failed_payment_fixes")
      .select("id, phone_number, name, policy_number", { count: "exact" })
      .eq("tcpa_flag", false)
      .or("tcpa_checked_at.is.null,tcpa_checked_at.eq.1990-01-01");

    if (stageFilter.length > 0) query = query.in("ghl_stage", stageFilter);
    if (carrierFilter.length > 0) query = query.in("carrier", carrierFilter);
    if (agencyFilter !== "all") query = query.eq("assigned_agency", agencyFilter);
    if (statusFilter.length > 0) query = query.in("policy_status", statusFilter);
    if (assignedFilter === "assigned") query = query.eq("assigned", true);
    else if (assignedFilter === "unassigned") query = query.eq("assigned", false);
    if (activeStatusFilter === "active") query = query.eq("is_active", true);
    else if (activeStatusFilter === "inactive") query = query.eq("is_active", false);

    const PAGE_SIZE = 1000;
    let tcpa = 0;
    let clear = 0;
    let errors = 0;
    let done = 0;
    let from = 0;

    while (true) {
      const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; phone_number: string | null; name: string | null; policy_number: string }[];
      if (rows.length === 0) break;

      const results = await Promise.allSettled(
        rows.map(async (row) => {
          if (!row.phone_number) return { status: "skip" as const };
          const tcpaResult = await checkTcpaStatus(row.phone_number);
          if (tcpaResult.status === "tcpa") {
            await supabase
              .from("failed_payment_fixes")
              .update({
                is_active: false,
                tcpa_flag: true,
                tcpa_checked_at: new Date().toISOString(),
                tcpa_message: tcpaResult.message.slice(0, 2000),
              })
              .eq("id", row.id);
            return { status: "tcpa" as const };
          }
          await supabase
            .from("failed_payment_fixes")
            .update({
              tcpa_flag: false,
              tcpa_checked_at: new Date().toISOString(),
              tcpa_message: tcpaResult.status === "dnc" ? tcpaResult.message.slice(0, 2000) : null,
            })
            .eq("id", row.id);
          return { status: "clear" as const };
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value.status === "tcpa") tcpa++;
          else if (r.value.status === "clear") clear++;
        } else {
          errors++;
        }
      }
      done += rows.length;
      setProgress({ done, total: poolCount ?? 0, tcpa, clear, errors });

      if (rows.length < PAGE_SIZE || (count !== null && done >= count)) break;
      from += PAGE_SIZE;
    }

    toastRef.current({
      title: "TCPA Check complete",
      description: `Checked ${done} • TCPA found ${tcpa} • Clear ${clear} • Errors ${errors}`,
    });

    setRunning(false);
    onCompleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[90vw] !max-w-none !h-[85vh] overflow-hidden flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>Bulk TCPA Check</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Pool: {loadingPool ? (
              <span className="inline-flex items-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
              </span>
            ) : (
              <>
                Showing first {pool.length} of <span className="font-medium">{poolCount ?? 0}</span> leads
              </>
            )}.
            TCPA will be checked per lead; flagged leads will be marked inactive.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Filter by Agency</span>
              <Select value={agencyFilter} onValueChange={(v) => setAgencyFilter(v)}>
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
                onChange={(selected) => setStageFilter(selected)}
                placeholder="All Stages"
                className="w-full"
                showAllOption={true}
                allOptionLabel="All Stages"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Filter by Status</span>
            <MultiSelect
              options={POLICY_STATUS_OPTIONS}
              selected={statusFilter}
              onChange={(selected) => setStatusFilter(selected)}
              placeholder="All Statuses"
              className="w-full"
              showAllOption={true}
              allOptionLabel="All Statuses"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Filter by Assignment</span>
              <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNED_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Filter by Active Status</span>
              <Select value={activeStatusFilter} onValueChange={(v) => setActiveStatusFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
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
                  <>Showing first 10 of <span className="font-medium">{poolCount ?? 0}</span> leads</>
                )}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadPool()}
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
                  </tr>
                </thead>
                <tbody>
                  {pool.map((deal, idx) => (
                    <tr key={deal.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">{deal.name ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{deal.phone_number ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{deal.policy_number}</td>
                      <td className="px-3 py-2">{deal.carrier ?? "-"}</td>
                      <td className="px-3 py-2">{deal.assigned_agency ?? "-"}</td>
                      <td className="px-3 py-2">{deal.ghl_stage ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loadingPool && pool.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center border rounded-md">
              No leads match the selected filters.
            </div>
          )}

          <Separator />

          {(running || progress.total > 0) && (
            <div className="text-xs text-muted-foreground">
              Progress {progress.done}/{progress.total} • TCPA {progress.tcpa} • Clear {progress.clear} • Errors {progress.errors}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Close
          </Button>
          <Button onClick={handleRun} disabled={!poolCount || poolCount === 0 || running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Run TCPA Check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}