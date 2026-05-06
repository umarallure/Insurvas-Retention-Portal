"use client";

import React from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, UserMinus } from "lucide-react";

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

type FailedPaymentFixRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  policy_number: string;
  ghl_stage: string | null;
  assigned: boolean;
  is_active: boolean;
  assigned_agency: string | null;
  assigned_to_profile_id: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  assigned_agency: string | null;
};

type BulkUnassignModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
};

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function FailedPaymentFixBulkUnassignModal(props: BulkUnassignModalProps) {
  const { toast } = useToast();
  const { open, onOpenChange, onCompleted } = props;

  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [loading, setLoading] = React.useState(false);
  const [unassigning, setUnassigning] = React.useState(false);
  const [assignedDeals, setAssignedDeals] = React.useState<FailedPaymentFixRow[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = React.useState(false);
  const [stageFilter, setStageFilter] = React.useState<string>("all");
  const [agencyFilter, setAgencyFilter] = React.useState<string>("all");
  const [agentFilter, setAgentFilter] = React.useState<string>("all");
  const [agents, setAgents] = React.useState<ProfileRow[]>([]);

  const reset = React.useCallback(() => {
    setAssignedDeals([]);
    setSelectedIds(new Set());
    setSelectAll(false);
    setLoading(false);
    setUnassigning(false);
    setStageFilter("all");
    setAgencyFilter("all");
    setAgentFilter("all");
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const loadAgents = React.useCallback(async () => {
    try {
      const { data: raRows, error: raError } = await supabase
        .from("retention_agents")
        .select("profile_id, assigned_agency")
        .eq("active", true);

      if (raError) {
        console.error("[failed-payment-fix-bulk-unassign] loadAgents error", raError);
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
        console.error("[failed-payment-fix-bulk-unassign] loadAgents profiles error", profilesError);
        return;
      }

      const agencyByProfileId = new Map<string, string | null>();
      for (const row of raRows ?? []) {
        agencyByProfileId.set(row.profile_id, row.assigned_agency);
      }

      const mapped: ProfileRow[] = (profileRows ?? []).map((p) => ({
        id: p.id as string,
        display_name: (p.display_name as string | null) ?? null,
        assigned_agency: agencyByProfileId.get(p.id) ?? null,
      }));

      setAgents(mapped);
    } catch (e) {
      console.error("[failed-payment-fix-bulk-unassign] loadAgents error", e);
    }
  }, []);

  const loadAssignedDeals = React.useCallback(async () => {
    setLoading(true);
    try {
      const PAGE_SIZE = 1000;
      let offset = 0;
      const all: FailedPaymentFixRow[] = [];

      while (true) {
        const { data, error, count } = await supabase
          .from("failed_payment_fixes")
          .select("id, name, phone_number, policy_number, ghl_stage, assigned, is_active, assigned_agency, assigned_to_profile_id", { count: "exact" })
          .eq("assigned", true)
          .eq("is_active", true)
          .order("created_at", { ascending: false, nullsFirst: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;

        const rows = (data ?? []) as FailedPaymentFixRow[];
        all.push(...rows);

        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        if (offset > 50000) break;
      }

      setAssignedDeals(all);
    } catch (e) {
      console.error("[failed-payment-fix-bulk-unassign] loadAssignedDeals error", e);
      toastRef.current({
        title: "Failed to load",
        description: "Could not load assigned failed payment fixes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void loadAssignedDeals();
    void loadAgents();
  }, [open, loadAssignedDeals, loadAgents]);

  const filteredDeals = React.useMemo(() => {
    let deals = assignedDeals;
    if (stageFilter !== "all") {
      deals = deals.filter((d) => d.ghl_stage === stageFilter);
    }
    if (agencyFilter !== "all") {
      deals = deals.filter((d) => d.assigned_agency === agencyFilter);
    }
    if (agentFilter !== "all") {
      deals = deals.filter((d) => d.assigned_to_profile_id === agentFilter);
    }
    return deals;
  }, [assignedDeals, stageFilter, agencyFilter, agentFilter]);

  React.useEffect(() => {
    setSelectAll(false);
    setSelectedIds(new Set());
  }, [stageFilter, agencyFilter, agentFilter]);

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(filteredDeals.map((d) => d.id)));
      setSelectAll(true);
    }
  };

  const handleToggleRow = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
      setSelectAll(false);
    } else {
      newSet.add(id);
      if (newSet.size === filteredDeals.length) {
        setSelectAll(true);
      }
    }
    setSelectedIds(newSet);
  };

  const canUnassign = selectedIds.size > 0 && !unassigning && !loading;

  const bulkUnassign = async () => {
    if (!canUnassign) return;

    setUnassigning(true);
    try {
      const idsToUnassign = Array.from(selectedIds);

      for (const batch of chunk(idsToUnassign, 200)) {
        const { error } = await supabase
          .from("failed_payment_fixes")
          .update({
            assigned: false,
            assigned_to_profile_id: null,
            assigned_by_profile_id: null,
            assigned_at: null,
          })
          .in("id", batch);

        if (error) throw error;
      }

      toastRef.current({
        title: "Bulk unassign complete",
        description: `Unassigned ${idsToUnassign.length} failed payment fix(es).`,
      });

      onOpenChange(false);
      onCompleted?.();
    } catch (e) {
      console.error("[failed-payment-fix-bulk-unassign] unassign error", e);
      toastRef.current({
        title: "Bulk unassign failed",
        description: "Could not unassign failed payment fixes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUnassigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Unassign Failed Payment Fixes</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-md border bg-muted/10 p-3">
            <div className="flex items-center gap-2">
              <div className="text-sm">
                <div className="font-medium">Stage</div>
                <div className="text-muted-foreground">
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All Stages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      {STAGE_OPTIONS.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm">
                <div className="font-medium">Agency</div>
                <div className="text-muted-foreground">
                  <Select value={agencyFilter} onValueChange={setAgencyFilter}>
                    <SelectTrigger className="w-[200px]">
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
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm">
                <div className="font-medium">Agent</div>
                <div className="text-muted-foreground">
                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All Agents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.display_name ?? agent.id} {agent.assigned_agency ? `(${agent.assigned_agency})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex-1 text-sm">
              <div className="font-medium">Summary</div>
              <div className="text-muted-foreground">
                {loading ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading assigned deals...
                  </span>
                ) : (
                  <>
                    Showing: <span className="font-medium">{filteredDeals.length}</span>
                    <span className="mx-2">•</span>
                    Total assigned: <span className="font-medium">{assignedDeals.length}</span>
                    <span className="mx-2">•</span>
                    Selected: <span className="font-medium">{selectedIds.size}</span>
                  </>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => void loadAssignedDeals()}
              disabled={loading || unassigning}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reload
            </Button>
          </div>

          <div className="flex-1 overflow-auto border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDeals.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                {assignedDeals.length === 0 ? "No assigned failed payment fixes found." : "No deals match the selected filters."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Phone</th>
                    <th className="text-left px-3 py-2 font-medium">Policy #</th>
                    <th className="text-left px-3 py-2 font-medium">Agency</th>
                    <th className="text-left px-3 py-2 font-medium">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeals.map((deal) => {
                    const isSelected = selectedIds.has(deal.id);
                    return (
                      <tr
                        key={deal.id}
                        className={`border-t cursor-pointer ${isSelected ? "bg-muted/30" : ""}`}
                        onClick={() => handleToggleRow(deal.id)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRow(deal.id)}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 truncate max-w-[200px]">{deal.name ?? "Unknown"}</td>
                        <td className="px-3 py-2 truncate max-w-[150px] font-mono text-xs">{deal.phone_number ?? "-"}</td>
                        <td className="px-3 py-2 truncate max-w-[150px] font-mono text-xs">{deal.policy_number}</td>
                        <td className="px-3 py-2 truncate max-w-[150px]">{deal.assigned_agency ?? "-"}</td>
                        <td className="px-3 py-2 truncate max-w-[180px] text-xs">{deal.ghl_stage ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-md border border-red-200 bg-red-50/50 p-3">
            <div className="text-sm font-medium text-red-800">Danger zone</div>
            <div className="text-xs text-red-600 mt-1">
              This will unassign the selected failed payment fix(es). They will become available for reassignment.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={unassigning}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void bulkUnassign()} disabled={!canUnassign}>
            {unassigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-4 w-4" />}
            Unassign {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
