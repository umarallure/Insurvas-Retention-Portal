"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

type LeadRow = {
  id: string;
  submission_id: string | null;
  customer_full_name: string | null;
  phone_number: string | null;
  lead_vendor: string | null;
  state: string | null;
  created_at: string | null;
};

type AssignmentRow = {
  id: string;
  lead_id: string;
  assignee_profile_id: string;
  status: string;
  assigned_at: string;
  assignee_display_name?: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

const PAGE_SIZE = 25;

export default function ManagerAssignLeadPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [totalLeads, setTotalLeads] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [agents, setAgents] = useState<ProfileRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeLead, setActiveLead] = useState<LeadRow | null>(null);
  const [originalAgentId, setOriginalAgentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const pageCount = useMemo(() => {
    if (!totalLeads) return 1;
    return Math.max(1, Math.ceil(totalLeads / PAGE_SIZE));
  }, [totalLeads]);

  const loadAgents = useCallback(async () => {
      const { data: raRows, error: raError } = await supabase
        .from("retention_agents")
        .select("profile_id")
        .eq("active", true);

      if (raError) {
        console.error("[manager-assign-lead] loadAgents retention_agents error", raError);
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
        console.error("[manager-assign-lead] loadAgents profiles error", profilesError);
        return;
      }

      const mapped: ProfileRow[] = (profileRows ?? []).map((p) => ({
        id: p.id as string,
        display_name: (p.display_name as string | null) ?? null,
        email: null,
      }));

      setAgents(mapped);
  }, []);

  const loadLeadsAndAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const trimmed = search.trim();

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("leads")
        .select("id, submission_id, customer_full_name, phone_number, lead_vendor, state, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false });

      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        query = query.or(
          `customer_full_name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,submission_id.ilike.%${escaped}%`,
        );
      }

      const { data: leadsData, error: leadsError, count } = await query.range(from, to);

      if (leadsError) throw leadsError;

      const typedLeads: LeadRow[] = (leadsData ?? []) as LeadRow[];
      setLeads(typedLeads);
      setTotalLeads(count ?? null);

      const leadIds = typedLeads.map((l) => l.id);
      if (leadIds.length === 0) {
        setAssignments([]);
        return;
      }

      const { data: assignmentData, error: assignmentError } = await supabase
        .from("retention_assigned_leads")
        .select("id, lead_id, assignee_profile_id, status, assigned_at")
        .in("lead_id", leadIds)
        .eq("status", "active");

      if (assignmentError) throw assignmentError;

      const activeAssignments: AssignmentRow[] = (assignmentData ?? []) as AssignmentRow[];

      if (activeAssignments.length > 0) {
        const agentIds = Array.from(new Set(activeAssignments.map((a) => a.assignee_profile_id)));
        const { data: agentProfiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", agentIds);

        const nameById = new Map<string, string | null>();
        ((agentProfiles ?? []) as { id: string; display_name: string | null }[]).forEach((p) => {
          nameById.set(p.id, p.display_name ?? null);
        });

        setAssignments(
          activeAssignments.map((a) => ({
            ...a,
            assignee_display_name: nameById.get(a.assignee_profile_id) ?? null,
          })),
        );
      } else {
        setAssignments([]);
      }
    } catch (error) {
      console.error("[manager-assign-lead] load error", error);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    void loadLeadsAndAssignments();
  }, [loadLeadsAndAssignments]);

  const openAssignModal = (lead: LeadRow) => {
    setActiveLead(lead);
    const existingAssignment = currentAssignmentForLead(lead.id);
    const currentAgentId = existingAssignment?.assignee_profile_id ?? null;
    setOriginalAgentId(currentAgentId);
    setSelectedAgentId(currentAgentId ?? "");
    setModalOpen(true);
  };

  const currentAssignmentForLead = (leadId: string) => {
    return assignments.find((a) => a.lead_id === leadId) || null;
  };

  const handleSaveAssignment = async () => {
    if (!activeLead || !selectedAgentId) return;
    if (originalAgentId && selectedAgentId === originalAgentId) return;

    setSaving(true);
    try {
      // Check if an assignment already exists for this lead.
      const { data: existingAssignment, error: existingError } = await supabase
        .from("retention_assigned_leads")
        .select("id")
        .eq("lead_id", activeLead.id)
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;

      let mutationError: unknown = null;

      if (existingAssignment) {
        // Update the existing row instead of inserting a new one to avoid duplicates.
        const { error } = await supabase
          .from("retention_assigned_leads")
          .update({
            assignee_profile_id: selectedAgentId,
            assigned_by_profile_id: selectedAgentId,
            status: "active",
            assigned_at: new Date().toISOString(),
          })
          .eq("id", existingAssignment.id);

        mutationError = error;
      } else {
        const { error } = await supabase.from("retention_assigned_leads").insert({
          lead_id: activeLead.id,
          assignee_profile_id: selectedAgentId,
          assigned_by_profile_id: selectedAgentId,
          status: "active",
        });

        mutationError = error;
      }

      if (mutationError) throw mutationError;

      const { data: refreshedAssignments, error: refreshedError } = await supabase
        .from("retention_assigned_leads")
        .select("id, lead_id, assignee_profile_id, status, assigned_at")
        .in("lead_id", leads.map((l) => l.id))
        .eq("status", "active");

      if (refreshedError) throw refreshedError;

      const activeAssignments: AssignmentRow[] = (refreshedAssignments ?? []) as AssignmentRow[];
      if (activeAssignments.length > 0) {
        const agentIds = Array.from(
          new Set(activeAssignments.map((a) => a.assignee_profile_id)),
        );
        const { data: agentProfiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", agentIds);

        const nameById = new Map<string, string | null>();
        ((agentProfiles ?? []) as { id: string; display_name: string | null }[]).forEach(
          (p) => {
            nameById.set(p.id, p.display_name ?? null);
          },
        );

        setAssignments(
          activeAssignments.map((a) => ({
            ...a,
            assignee_display_name: nameById.get(a.assignee_profile_id) ?? null,
          })),
        );
      } else {
        setAssignments([]);
      }

      const assignedAgent = agents.find((a) => a.id === selectedAgentId);
      toast({
        title: "Lead assigned",
        description:
          assignedAgent && activeLead.customer_full_name
            ? `${activeLead.customer_full_name} assigned to ${assignedAgent.display_name ?? "agent"}`
            : "Lead assignment saved.",
      });

      setModalOpen(false);
      setOriginalAgentId(null);
      setSelectedAgentId("");
    } catch (error) {
      console.error("[manager-assign-lead] save error", error);
      toast({
        title: "Assignment failed",
        description: "Could not assign lead. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredLeads = leads;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAgents();
      await loadLeadsAndAssignments();
      toast({
        title: "Refreshed",
        description: "Latest records loaded.",
      });
    } catch (error) {
      console.error("[manager-assign-lead] refresh error", error);
      toast({
        title: "Refresh failed",
        description: "Could not refresh records. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Assign Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View all leads and assign each one to a retention agent.
          </p>
        </div>
      </div>

      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Leads</CardTitle>
            <CardDescription>Paginated view of leads with assignment status.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Input
                placeholder="Search by name, phone, or submission ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />

              <Button
                variant="outline"
                className="lg:ml-auto"
                onClick={handleRefresh}
                disabled={loading || saving || refreshing}
              >
                {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-5 gap-4 p-3 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">Name</div>
                <div>Phone</div>
                <div>Vendor / State</div>
                <div>Assigned Agent</div>
              </div>
              {loading ? (
                <div className="border-t p-6 flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading leads...
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="border-t p-3 text-sm text-muted-foreground">No leads found.</div>
              ) : (
                filteredLeads.map((lead) => {
                  const assignment = currentAssignmentForLead(lead.id);
                  return (
                    <div
                      key={lead.id}
                      className="grid grid-cols-5 gap-4 p-3 text-sm items-center border-t bg-background/40"
                    >
                      <div className="col-span-2 truncate" title={lead.customer_full_name ?? undefined}>
                        <span className="font-medium">{lead.customer_full_name ?? "Unknown"}</span>
                        {lead.submission_id ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            #{lead.submission_id}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate" title={lead.phone_number ?? undefined}>
                        {lead.phone_number ?? "-"}
                      </div>
                      <div className="truncate">
                        {lead.lead_vendor ?? "-"} {lead.state ? `(${lead.state})` : ""}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {assignment?.assignee_display_name ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {assignment.assignee_display_name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => openAssignModal(lead)}
                        >
                          {assignment ? "Change" : "Assign"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
              <div>
                Page {page} of {pageCount}
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

      {/* Use modal={false} so nested Radix Select can open properly inside the dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen} modal={false}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              {activeLead ? (
                <>
                  Assigning <span className="font-medium">{activeLead.customer_full_name}</span>
                  {activeLead.submission_id ? ` (Submission: ${activeLead.submission_id})` : null}
                </>
              ) : (
                "No lead selected."
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
                      {agent.display_name || agent.email || agent.id}
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
            <Button
              onClick={handleSaveAssignment}
              disabled={
                saving ||
                !selectedAgentId ||
                (!!originalAgentId && selectedAgentId === originalAgentId)
              }
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
