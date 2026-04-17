"use client";

import React from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, UserMinus } from "lucide-react";

type CallBackDealRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  submission_id: string;
  stage: string | null;
  assigned: boolean;
  is_active: boolean;
  assigned_to_profile_id: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type CallBackBulkUnassignModalProps = {
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

export function CallBackBulkUnassignModal(props: CallBackBulkUnassignModalProps) {
  const { toast } = useToast();
  const { open, onOpenChange, onCompleted } = props;

  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [loading, setLoading] = React.useState(false);
  const [unassigning, setUnassigning] = React.useState(false);
  const [assignedDeals, setAssignedDeals] = React.useState<CallBackDealRow[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = React.useState(false);

  const reset = React.useCallback(() => {
    setAssignedDeals([]);
    setSelectedIds(new Set());
    setSelectAll(false);
    setLoading(false);
    setUnassigning(false);
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const loadAssignedDeals = React.useCallback(async () => {
    setLoading(true);
    try {
      const PAGE_SIZE = 1000;
      let offset = 0;
      const all: CallBackDealRow[] = [];

      while (true) {
        const { data, error, count } = await supabase
          .from("call_back_deals")
          .select("id, name, phone_number, submission_id, stage, assigned, is_active, assigned_to_profile_id", { count: "exact" })
          .eq("assigned", true)
          .eq("is_active", true)
          .order("last_synced_at", { ascending: false, nullsFirst: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;

        const rows = (data ?? []) as CallBackDealRow[];
        all.push(...rows);

        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        if (offset > 50000) break;
      }

      setAssignedDeals(all);
    } catch (e) {
      console.error("[callback-bulk-unassign] loadAssignedDeals error", e);
      toastRef.current({
        title: "Failed to load",
        description: "Could not load assigned call back deals.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void loadAssignedDeals();
  }, [open, loadAssignedDeals]);

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(assignedDeals.map((d) => d.id)));
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
      if (newSet.size === assignedDeals.length) {
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
          .from("call_back_deals")
          .update({
            assigned: false,
            assigned_to_profile_id: null,
            assigned_at: null,
          })
          .in("id", batch);

        if (error) throw error;
      }

      toastRef.current({
        title: "Bulk unassign complete",
        description: `Unassigned ${idsToUnassign.length} call back deal(s).`,
      });

      onOpenChange(false);
      onCompleted?.();
    } catch (e) {
      console.error("[callback-bulk-unassign] unassign error", e);
      toastRef.current({
        title: "Bulk unassign failed",
        description: "Could not unassign call back deals. Please try again.",
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
          <DialogTitle>Bulk Unassign Call Back Deals</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="rounded-md border bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">Summary</div>
                <div className="text-muted-foreground">
                  {loading ? (
                    <span className="inline-flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading assigned deals...
                    </span>
                  ) : (
                    <>
                      Total assigned deals: <span className="font-medium">{assignedDeals.length}</span>
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
          </div>

          <div className="flex-1 overflow-auto border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : assignedDeals.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No assigned call back deals found.
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
                    <th className="text-left px-3 py-2 font-medium">Stage</th>
                    <th className="text-left px-3 py-2 font-medium">Submission ID</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedDeals.map((deal) => {
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
                        <td className="px-3 py-2 truncate max-w-[150px]">{deal.phone_number ?? "-"}</td>
                        <td className="px-3 py-2 truncate max-w-[150px]">{deal.stage ?? "-"}</td>
                        <td className="px-3 py-2 truncate max-w-[150px] font-mono text-xs">{deal.submission_id}</td>
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
              This will unassign the selected call back deal(s). They will become available for reassignment.
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