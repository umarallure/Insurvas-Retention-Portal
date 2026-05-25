"use client";

import React from "react";
import { flushSync } from "react-dom";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { checkTcpaStatus } from "@/lib/call-back-deals/tcpa";

type PoolRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  submission_id: string;
};

type LogEntry = {
  time: string;
  phone: string;
  name: string;
  status: "checking" | "clear" | "tcpa" | "dnc" | "skip" | "error";
  message?: string;
};

type CallBackBulkTcpaCheckModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
};

const STAGE_OPTIONS = [
  "Incomplete Transfer",
  "Application Withdrawn",
  "Needs BPO Callback",
  "Declined Underwriting",
  "Internal-Leads-Never-Called",
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

function buildCountQuery(filters: { stageFilter: string[]; assignedFilter: string; activeStatusFilter: string }) {
  let q = supabase.from("call_back_deals").select("id", { count: "exact", head: true });
  if (filters.stageFilter.length > 0) q = q.in("stage", filters.stageFilter);
  if (filters.assignedFilter === "assigned") q = q.eq("assigned", true);
  else if (filters.assignedFilter === "unassigned") q = q.eq("assigned", false);
  if (filters.activeStatusFilter === "active") q = q.eq("is_active", true);
  else if (filters.activeStatusFilter === "inactive") q = q.eq("is_active", false);
  return q;
}

function buildDataQuery(filters: { stageFilter: string[]; assignedFilter: string; activeStatusFilter: string }, select: string) {
  let q = supabase.from("call_back_deals").select(select);
  if (filters.stageFilter.length > 0) q = q.in("stage", filters.stageFilter);
  if (filters.assignedFilter === "assigned") q = q.eq("assigned", true);
  else if (filters.assignedFilter === "unassigned") q = q.eq("assigned", false);
  if (filters.activeStatusFilter === "active") q = q.eq("is_active", true);
  else if (filters.activeStatusFilter === "inactive") q = q.eq("is_active", false);
  return q;
}

function buildRunQuery(filters: { stageFilter: string[]; assignedFilter: string; activeStatusFilter: string }) {
  let q = supabase.from("call_back_deals").select("id, phone_number, name", { count: "exact" });
  if (filters.stageFilter.length > 0) q = q.in("stage", filters.stageFilter);
  if (filters.assignedFilter === "assigned") q = q.eq("assigned", true);
  else if (filters.assignedFilter === "unassigned") q = q.eq("assigned", false);
  if (filters.activeStatusFilter === "active") q = q.eq("is_active", true);
  else if (filters.activeStatusFilter === "inactive") q = q.eq("is_active", false);
  return q;
}

function ts(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function logColor(status: LogEntry["status"]): string {
  switch (status) {
    case "checking": return "text-blue-400";
    case "clear": return "text-green-400";
    case "tcpa": return "text-red-400";
    case "dnc": return "text-yellow-400";
    case "skip": return "text-gray-400";
    case "error": return "text-red-300";
    default: return "text-muted-foreground";
  }
}

export function CallBackBulkTcpaCheckModal(props: CallBackBulkTcpaCheckModalProps) {
  const { open, onOpenChange, onCompleted } = props;
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => { toastRef.current = toast; }, [toast]);

  const [loadingPool, setLoadingPool] = React.useState(false);
  const [pool, setPool] = React.useState<PoolRow[]>([]);
  const [poolCount, setPoolCount] = React.useState<number | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [stageFilter, setStageFilter] = React.useState<string[]>([]);
  const [assignedFilter, setAssignedFilter] = React.useState<string>("all");
  const [activeStatusFilter, setActiveStatusFilter] = React.useState<string>("active");

  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<{
    done: number;
    total: number;
    tcpa: number;
    clear: number;
    errors: number;
  }>({ done: 0, total: 0, tcpa: 0, clear: 0, errors: 0 });
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const logsRef = React.useRef<LogEntry[]>([]);
  const logEndRef = React.useRef<HTMLDivElement>(null);

  const filters = { stageFilter, assignedFilter, activeStatusFilter };

  const loadPool = React.useCallback(async () => {
    setLoadingPool(true);
    try {
      const { count: totalCount } = await buildCountQuery(filters);
      setPoolCount(totalCount ?? 0);

      const allRows: PoolRow[] = [];
      let offset = 0;
      const limit = 1000;
      while (true) {
        const { data, error } = await buildDataQuery(filters, "id, name, phone_number, submission_id").range(offset, offset + limit - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as PoolRow[];
        allRows.push(...batch);
        if (batch.length < limit) break;
        offset += limit;
      }
      setPool(allRows);
      setSelectedIds(new Set(allRows.map((r) => r.id)));
    } catch (error) {
      toastRef.current({
        title: "Failed to load pool",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingPool(false);
    }
  }, [stageFilter, assignedFilter, activeStatusFilter]);

  React.useEffect(() => {
    if (!open) return;
    void loadPool();
  }, [open, loadPool]);

  React.useEffect(() => {
    if (!open) {
      setLogs([]);
      setProgress({ done: 0, total: 0, tcpa: 0, clear: 0, errors: 0 });
    }
  }, [open]);

  const allSelected = pool.length > 0 && selectedIds.size === pool.length;
  const noneSelected = selectedIds.size === 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pool.map((r) => r.id)));
    }
  };

  const handleRun = async () => {
    if (running || selectedIds.size === 0) return;
    setRunning(true);
    logsRef.current = [];
    setLogs([]);
    setProgress({ done: 0, total: selectedIds.size, tcpa: 0, clear: 0, errors: 0 });

    const idsToCheck = Array.from(selectedIds);
    const PAGE_SIZE = 500;
    const CONCURRENCY = 10;
    let tcpa = 0;
    let clear2 = 0;
    let errors = 0;
    let done = 0;

    const flushLogs = () => {
      const snapshot = logsRef.current.length > 500 ? logsRef.current.slice(-500) : [...logsRef.current];
      flushSync(() => {
        setLogs(snapshot);
        setProgress({ done, total: idsToCheck.length, tcpa, clear: clear2, errors });
      });
      requestAnimationFrame(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }));
    };

    for (let offset = 0; offset < idsToCheck.length; offset += PAGE_SIZE) {
      const pageIds = idsToCheck.slice(offset, offset + PAGE_SIZE);
      const { data, error } = await supabase
        .from("call_back_deals")
        .select("id, phone_number, name")
        .in("id", pageIds);

      if (error) {
        logsRef.current.push({ time: ts(), phone: "-", name: "-", status: "error", message: error.message });
        errors += pageIds.length;
        done += pageIds.length;
        flushLogs();
        continue;
      }

      const rows = (data ?? []) as { id: string; phone_number: string | null; name: string | null }[];

      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const batch = rows.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (row) => {
            const displayName = row.name ?? "-";
            const displayPhone = row.phone_number ?? "-";
            logsRef.current.push({ time: ts(), phone: displayPhone, name: displayName, status: "checking" });

            if (!row.phone_number) {
              logsRef.current.push({ time: ts(), phone: displayPhone, name: displayName, status: "skip", message: "No phone number" });
              return { status: "skip" as const };
            }
            try {
              const tcpaResult = await checkTcpaStatus(row.phone_number);
              if (tcpaResult.status === "tcpa") {
                await supabase
                  .from("call_back_deals")
                  .update({
                    is_active: false,
                    tcpa_flag: true,
                    tcpa_checked_at: new Date().toISOString(),
                    tcpa_message: tcpaResult.message.slice(0, 2000),
                  })
                  .eq("id", row.id);
                logsRef.current.push({ time: ts(), phone: displayPhone, name: displayName, status: "tcpa", message: tcpaResult.message.slice(0, 120) });
                return { status: "tcpa" as const };
              }
              if (tcpaResult.status === "dnc") {
                await supabase
                  .from("call_back_deals")
                  .update({
                    tcpa_flag: false,
                    tcpa_checked_at: new Date().toISOString(),
                    tcpa_message: tcpaResult.message.slice(0, 2000),
                  })
                  .eq("id", row.id);
                logsRef.current.push({ time: ts(), phone: displayPhone, name: displayName, status: "dnc", message: tcpaResult.message.slice(0, 120) });
                return { status: "clear" as const };
              }
              await supabase
                .from("call_back_deals")
                .update({
                  tcpa_flag: false,
                  tcpa_checked_at: new Date().toISOString(),
                  tcpa_message: null,
                })
                .eq("id", row.id);
              logsRef.current.push({ time: ts(), phone: displayPhone, name: displayName, status: "clear", message: "Clear" });
              return { status: "clear" as const };
            } catch (err) {
              logsRef.current.push({ time: ts(), phone: displayPhone, name: displayName, status: "error", message: err instanceof Error ? err.message : "Unknown error" });
              return { status: "error" as const };
            }
          }),
        );

        for (const r of results) {
          if (r.status === "fulfilled") {
            if (r.value.status === "tcpa") tcpa++;
            else if (r.value.status === "clear") clear2++;
          } else {
            errors++;
          }
        }
        done += batch.length;
        flushLogs();
      }

      done += pageIds.length - rows.length;
      flushLogs();
    }

    toastRef.current({
      title: "TCPA Check complete",
      description: `Checked ${done} • TCPA found ${tcpa} • Clear ${clear2} • Errors ${errors}`,
    });

    setRunning(false);
    onCompleted?.();
  };

  const selectedCount = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[95vw] !max-w-none !h-[90vh] overflow-hidden flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>Bulk TCPA Check — Call Back Deals</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            {loadingPool ? (
              <span className="inline-flex items-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading pool...
              </span>
            ) : (
              <>Pool: <span className="font-medium">{poolCount ?? 0}</span> leads — <span className="font-medium">{selectedCount}</span> selected</>
            )}.
            TCPA will be checked per selected lead; flagged leads will be marked inactive.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Filter by Assignment</span>
              <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v)}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {ASSIGNED_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Filter by Active Status</span>
              <Select value={activeStatusFilter} onValueChange={(v) => setActiveStatusFilter(v)}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {ACTIVE_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadPool()}
              disabled={loadingPool || running}
            >
              {loadingPool ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reload Pool
            </Button>
            <Button variant="outline" size="sm" onClick={toggleAll} disabled={running || pool.length === 0}>
              {allSelected ? "Deselect All" : "Select All"}
            </Button>
            <span className="text-xs text-muted-foreground ml-2">
              {selectedCount} of {pool.length} selected
            </span>
          </div>

          <Separator />

          {!loadingPool && pool.length > 0 && (
            <div className="overflow-auto border rounded-md max-h-[30vh]">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium w-[40px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Phone</th>
                    <th className="text-left px-3 py-2 font-medium">Submission ID</th>
                  </tr>
                </thead>
                <tbody>
                  {pool.map((deal) => (
                    <tr key={deal.id} className={`border-t ${selectedIds.has(deal.id) ? "" : "opacity-40"}`}>
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selectedIds.has(deal.id)}
                          onCheckedChange={(checked) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(deal.id);
                              else next.delete(deal.id);
                              return next;
                            });
                          }}
                          aria-label={`Select ${deal.name ?? deal.id}`}
                        />
                      </td>
                      <td className="px-3 py-2">{deal.name ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{deal.phone_number ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{deal.submission_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pool.length === 0 && !loadingPool && (
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

          {logs.length > 0 && (
            <div className="border rounded-md bg-zinc-950 text-xs font-mono overflow-auto max-h-[25vh] p-2">
              {logs.map((log, idx) => (
                <div key={idx} className={`flex gap-2 ${logColor(log.status)}`}>
                  <span className="text-muted-foreground shrink-0">[{log.time}]</span>
                  <span className="shrink-0">{log.phone}</span>
                  <span className="shrink-0">{log.name}</span>
                  <span className="font-bold uppercase">{log.status}</span>
                  {log.message ? <span className="text-muted-foreground truncate">{log.message}</span> : null}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Close
          </Button>
          <Button onClick={handleRun} disabled={running || noneSelected || pool.length === 0}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Run TCPA Check ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}