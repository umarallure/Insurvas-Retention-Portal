"use client"

import React from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

import { getGhlStages, type GhlStageOption } from "../../../lib/retention-assignment.logic";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export type BulkUnassignAgentOption = {
  id: string;
  display_name: string | null;
};

type BulkUnassignModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: BulkUnassignAgentOption[];
  onCompleted?: () => void;
};

type DealRow = {
  id: number;
  monday_item_id: string | null;
};

type AssignmentRow = {
  id: string;
  deal_id?: number | null;
  assignee_profile_id: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function BulkUnassignModal(props: BulkUnassignModalProps) {
  const { toast } = useToast();
  const { open, onOpenChange, agents, onCompleted } = props;

  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [selectedStages, setSelectedStages] = React.useState<string[]>([]);
  const [agentId, setAgentId] = React.useState<string>("all");

  const [loading, setLoading] = React.useState(false);
  const [groupCount, setGroupCount] = React.useState<number | null>(null);
  const [assignedRows, setAssignedRows] = React.useState<AssignmentRow[]>([]);

  const [stages, setStages] = React.useState<GhlStageOption[]>([]);
  const [loadingStages, setLoadingStages] = React.useState(false);

  const [deleting, setDeleting] = React.useState(false);

  const reset = React.useCallback(() => {
    setSelectedStages([]);
    setAgentId("all");
    setGroupCount(null);
    setAssignedRows([]);
    setLoading(false);
    setDeleting(false);
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => {
    if (!open) return;

    const loadStages = async () => {
      setLoadingStages(true);
      try {
        const data = await getGhlStages();
        setStages(data);
      } catch (e) {
        console.error("[bulk-unassign] load stages error", e);
      } finally {
        setLoadingStages(false);
      }
    };

    void loadStages();
  }, [open]);

  const loadAssigned = React.useCallback(async () => {
    if (!selectedStages || selectedStages.length === 0) {
      setGroupCount(null);
      setAssignedRows([]);
      return;
    }

    setLoading(true);
    try {
      const dealsQuery = supabase
        .from("monday_com_deals")
        .select("id,monday_item_id", { count: "exact" })
        .in("ghl_stage", selectedStages)
        .not("monday_item_id", "is", null)
        .order("last_updated", { ascending: false, nullsFirst: false });

      const { data: dealRows, error: dealsError, count } = await dealsQuery.limit(2000);
      if (dealsError) throw dealsError;
      setGroupCount(count ?? null);

      const submissionIds = Array.from(
        new Set(
          ((dealRows ?? []) as DealRow[])
            .map((d) => (typeof d.monday_item_id === "string" ? d.monday_item_id.trim() : ""))
            .filter((v) => v.length > 0),
        ),
      );

      if (submissionIds.length === 0) {
        setAssignedRows([]);
        return;
      }

      const dealIds = Array.from(new Set(((dealRows ?? []) as DealRow[]).map((d) => d.id).filter((v): v is number => !!v)));

      if (dealIds.length === 0) {
        setAssignedRows([]);
        return;
      }

      let assignmentsQuery = supabase
        .from("retention_assigned_leads")
        .select("id, deal_id, assignee_profile_id")
        .in("deal_id", dealIds)
        .eq("status", "active")
        .limit(10000);

      if (agentId !== "all") {
        assignmentsQuery = assignmentsQuery.eq("assignee_profile_id", agentId);
      }

      const { data: rows, error: assignmentsError } = await assignmentsQuery;
      if (assignmentsError) throw assignmentsError;

      setAssignedRows((rows ?? []) as AssignmentRow[]);
    } catch (e) {
      console.error("[bulk-unassign] loadAssigned error", e);
      toastRef.current({
        title: "Failed to load",
        description: "Could not load assigned leads for the selected GHL stage(s).",
        variant: "destructive",
      });
      setGroupCount(null);
      setAssignedRows([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, selectedStages]);

  React.useEffect(() => {
    if (!open) return;
    void loadAssigned();
  }, [open, selectedStages, agentId, loadAssigned]);

  const canUnassign = selectedStages.length > 0 && assignedRows.length > 0 && !loading && !deleting;

  const bulkUnassign = async () => {
    if (!canUnassign) return;

    setDeleting(true);
    try {
      const ids = assignedRows.map((r) => r.id);
      for (const batch of chunk(ids, 200)) {
        const { error } = await supabase.from("retention_assigned_leads").delete().in("id", batch);
        if (error) throw error;
      }

      toastRef.current({
        title: "Bulk unassign complete",
        description: `Unassigned ${ids.length} lead(s).`,
      });

      onOpenChange(false);
      onCompleted?.();
    } catch (e) {
      console.error("[bulk-unassign] delete error", e);
      toastRef.current({
        title: "Bulk unassign failed",
        description: "Could not unassign leads. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Bulk Unassign Leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">GHL Stage(s)</div>
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full text-left" disabled={loadingStages}>
                      {selectedStages.length > 0 ? `${selectedStages.length} selected` : "Select stage(s)"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
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
                    <div className="max-h-64 overflow-auto">
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
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Assigned to agent (optional)</div>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.display_name ?? a.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


          </div>

          <div className="rounded-md border bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">Summary</div>
                <div className="text-muted-foreground">
                  {loading ? (
                    <span className="inline-flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                    </span>
                  ) : selectedStages.length > 0 ? (
                    <>
                      Total leads in this stage: <span className="font-medium">{groupCount ?? "—"}</span>
                      <span className="mx-2">•</span>
                      Assigned (matching filter): <span className="font-medium">{assignedRows.length}</span>
                    </>
                  ) : (
                    "Select a GHL stage to load assigned leads."
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={loadAssigned}
                disabled={selectedStages.length === 0 || loading || deleting}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reload
              </Button>
            </div>
          </div>

          <Separator />

          <div className="rounded-md border p-3 bg-background">
            <div className="text-sm font-medium">Danger zone</div>
            <div className="text-xs text-muted-foreground mt-1">
              This will permanently delete assignment records from <span className="font-mono">retention_assigned_leads</span>.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={bulkUnassign} disabled={!canUnassign}>
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Bulk Unassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
