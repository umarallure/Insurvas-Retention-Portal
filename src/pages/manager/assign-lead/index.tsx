"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { FilterIcon, Loader2 } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";

import { BulkAssignModal } from "@/components/manager/assign-lead/bulk-assign-modal";
import { BulkUnassignModal } from "@/components/manager/assign-lead/bulk-unassign-modal";
import { DEAL_GROUPS } from "@/components/manager/assign-lead/deal-groups";

type LeadRow = {
  id: string;
  submission_id: string | null;
  customer_full_name: string | null;
  phone_number: string | null;
  lead_vendor: string | null;
  state: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

type MondayDealRow = {
  id: number;
  monday_item_id: string | null;
  ghl_name: string | null;
  deal_name: string | null;
  phone_number: string | null;
  call_center: string | null;
  group_title: string | null;
  last_updated: string | null;
  carrier: string | null;
};

type AssignLeadRow = {
  monday_item_id: string;
  deal_id: number | null;
  display_name: string | null;
  phone_number: string | null;
  vendor: string | null;
  state: string | null;
  lead_id: string | null;
  carrier: string | null;
};

type AssignmentRow = {
  id: string;
  lead_id?: string | null;
  deal_id?: number | null;
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
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [carrierFilter, setCarrierFilter] = useState<string[]>([]);
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<AssignLeadRow[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [agents, setAgents] = useState<ProfileRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeLead, setActiveLead] = useState<AssignLeadRow | null>(null);
  const [originalAgentId, setOriginalAgentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [creatingLeadFor, setCreatingLeadFor] = useState<string | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkUnassignOpen, setBulkUnassignOpen] = useState(false);
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [activeUnassign, setActiveUnassign] = useState<{ row: AssignLeadRow; assignmentId: string } | null>(null);

  const leadsLoadInFlightRef = useRef(false);
  const leadsLastQueryKeyRef = useRef<string | null>(null);

  const pageCount = useMemo(() => {
    if (!totalRows) return 1;
    return Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  }, [totalRows]);

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

  const loadLeadsAndAssignments = useCallback(async (opts?: { force?: boolean }) => {
    const queryKey = JSON.stringify({ page, search: search.trim(), groupFilter, carrierFilter: carrierFilter.sort().join(","), agentFilter: agentFilter.sort().join(",") });
    if (!opts?.force && leadsLastQueryKeyRef.current === queryKey) return;
    if (leadsLoadInFlightRef.current) return;

    leadsLoadInFlightRef.current = true;
    leadsLastQueryKeyRef.current = queryKey;
    setLoading(true);
    try {
      const trimmed = search.trim();
      const selectedGroup = groupFilter === "all" ? null : DEAL_GROUPS.find((g) => g.id === groupFilter);

      // Filter by agent assignments if agentFilter is set
      let filteredDealIds: number[] | null = null;
      if (agentFilter.length > 0) {
        const hasUnassigned = agentFilter.includes("Unassigned");
        const agentNames = agentFilter.filter((name) => name !== "Unassigned");

        if (agentNames.length > 0) {
          // Get profile IDs for selected agent names
          const { data: agentProfiles } = await supabase
            .from("profiles")
            .select("id")
            .in("display_name", agentNames);

          const agentProfileIds = (agentProfiles ?? []).map((p) => p.id as string);

          if (agentProfileIds.length > 0) {
            // Get deal_ids assigned to these agents
            const { data: assignedDeals } = await supabase
              .from("retention_assigned_leads")
              .select("deal_id")
              .eq("status", "active")
              .in("assignee_profile_id", agentProfileIds)
              .not("deal_id", "is", null);

            const assignedDealIds = new Set(
              (assignedDeals ?? [])
                .map((a) => (typeof a.deal_id === "number" ? a.deal_id : null))
                .filter((id): id is number => id !== null)
            );

            if (hasUnassigned) {
              // If "Unassigned" is also selected, get ALL deal_ids with assignments
              const { data: allAssignedDeals } = await supabase
                .from("retention_assigned_leads")
                .select("deal_id")
                .eq("status", "active")
                .not("deal_id", "is", null);

              const allAssignedDealIds = new Set(
                (allAssignedDeals ?? [])
                  .map((a) => (typeof a.deal_id === "number" ? a.deal_id : null))
                  .filter((id): id is number => id !== null)
              );

              // Get all active deals and filter: either assigned to selected agents OR not assigned at all
              const { data: allActiveDeals } = await supabase
                .from("monday_com_deals")
                .select("id")
                .eq("is_active", true)
                .not("monday_item_id", "is", null);

              const allDealIds = (allActiveDeals ?? [])
                .map((d) => (typeof d.id === "number" ? d.id : null))
                .filter((id): id is number => id !== null);

              // Combine: deals assigned to selected agents OR unassigned deals
              filteredDealIds = Array.from(
                new Set([
                  ...Array.from(assignedDealIds),
                  ...allDealIds.filter((id) => !allAssignedDealIds.has(id)),
                ])
              );
            } else {
              // Only selected agents
              filteredDealIds = Array.from(assignedDealIds);
            }
          } else if (hasUnassigned) {
            // Only "Unassigned" selected, no valid agent names
            const { data: allAssignedDeals } = await supabase
              .from("retention_assigned_leads")
              .select("deal_id")
              .eq("status", "active")
              .not("deal_id", "is", null);

            const allAssignedDealIds = new Set(
              (allAssignedDeals ?? [])
                .map((a) => (typeof a.deal_id === "number" ? a.deal_id : null))
                .filter((id): id is number => id !== null)
            );

            const { data: allActiveDeals } = await supabase
              .from("monday_com_deals")
              .select("id")
              .eq("is_active", true)
              .not("monday_item_id", "is", null);

            const allDealIds = (allActiveDeals ?? [])
              .map((d) => (typeof d.id === "number" ? d.id : null))
              .filter((id): id is number => id !== null);

            filteredDealIds = allDealIds.filter((id) => !allAssignedDealIds.has(id));
          }
        } else if (hasUnassigned) {
          // Only "Unassigned" selected
          const { data: allAssignedDeals } = await supabase
            .from("retention_assigned_leads")
            .select("deal_id")
            .eq("status", "active")
            .not("deal_id", "is", null);

          const allAssignedDealIds = new Set(
            (allAssignedDeals ?? [])
              .map((a) => (typeof a.deal_id === "number" ? a.deal_id : null))
              .filter((id): id is number => id !== null)
          );

          const { data: allActiveDeals } = await supabase
            .from("monday_com_deals")
            .select("id")
            .eq("is_active", true)
            .not("monday_item_id", "is", null);

          const allDealIds = (allActiveDeals ?? [])
            .map((d) => (typeof d.id === "number" ? d.id : null))
            .filter((id): id is number => id !== null);

          filteredDealIds = allDealIds.filter((id) => !allAssignedDealIds.has(id));
        }
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let dealsQuery = supabase
        .from("monday_com_deals")
        .select(
          "id,monday_item_id,ghl_name,deal_name,phone_number,call_center,group_title,last_updated,carrier,ghl_stage",
          { count: "exact" },
        )
        .eq("is_active", true)
        .not("monday_item_id", "is", null)
        .order("last_updated", { ascending: false, nullsFirst: false });

      // Apply agent filter by deal_id if we have filtered deal IDs
      if (filteredDealIds !== null && filteredDealIds.length > 0) {
        dealsQuery = dealsQuery.in("id", filteredDealIds);
      } else if (filteredDealIds !== null && filteredDealIds.length === 0) {
        // No deals match the filter, return empty result
        setRows([]);
        setTotalRows(0);
        setAssignments([]);
        return;
      }

      // Always filter by GHL stages - only show the 4 categories (same logic as customers page)
      // When "all" is selected, show all 4 categories combined (1559 records)
      // When a specific category is selected, show only that category
      const stagesToFilter = selectedGroup && selectedGroup.ghlStages 
        ? selectedGroup.ghlStages 
        : DEAL_GROUPS.flatMap((g) => g.ghlStages); // All 4 categories when "all" is selected
      
      if (stagesToFilter.length > 0) {
        const stageFilters = stagesToFilter.map((stage) => `ghl_stage.ilike.%${stage.replace(/,/g, "")}%`).join(",");
        if (stageFilters.length > 0) {
          dealsQuery = dealsQuery.or(stageFilters);
        }
      }

      if (carrierFilter.length > 0) {
        dealsQuery = dealsQuery.in("carrier", carrierFilter);
      }

      if (trimmed) {
        const escaped = trimmed.replace(/,/g, "");
        dealsQuery = dealsQuery.or(
          `ghl_name.ilike.%${escaped}%,deal_name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,monday_item_id.ilike.%${escaped}%`,
        );
      }

      const { data: dealsData, error: dealsError, count } = await dealsQuery.range(from, to);
      if (dealsError) throw dealsError;

      const deals = (dealsData ?? []) as MondayDealRow[];
      setTotalRows(count ?? null);

      const mondayItemIds = Array.from(
        new Set(
          deals
            .map((d) => (typeof d.monday_item_id === "string" ? d.monday_item_id.trim() : ""))
            .filter((v) => v.length > 0),
        ),
      );

      const leadsBySubmissionId = new Map<string, LeadRow[]>();
      if (mondayItemIds.length > 0) {
        const { data: leadRows, error: leadError } = await supabase
          .from("leads")
          .select("id, submission_id, customer_full_name, phone_number, lead_vendor, state, created_at, updated_at")
          .in("submission_id", mondayItemIds)
          .limit(10000);

        if (leadError) throw leadError;
        for (const l of (leadRows ?? []) as LeadRow[]) {
          if (typeof l.submission_id === "string" && l.submission_id.trim().length) {
            const key = l.submission_id.trim();
            const prev = leadsBySubmissionId.get(key) ?? [];
            prev.push(l);
            leadsBySubmissionId.set(key, prev);
          }
        }
      }

      // NOTE: Previously we checked assigned lead ids here using `lead_id`.
      // The assignment table now uses `deal_id`, so we'll check assignments by deal_id later after we know the deals on this page.

      const chooseBestLead = (candidates: LeadRow[]): LeadRow | null => {
        if (!candidates || candidates.length === 0) return null;

        const toMillis = (iso: string | null | undefined) => {
          if (!iso) return 0;
          const t = Date.parse(iso);
          return Number.isFinite(t) ? t : 0;
        };

        return (
          [...candidates].sort((a, b) => {
            const aTime = Math.max(toMillis(a.updated_at), toMillis(a.created_at));
            const bTime = Math.max(toMillis(b.updated_at), toMillis(b.created_at));
            return bTime - aTime;
          })[0] ?? null
        );
      };

      const combinedRows: AssignLeadRow[] = deals.flatMap((d) => {
        const mondayId = typeof d.monday_item_id === "string" ? d.monday_item_id.trim() : "";
        if (!mondayId) return [] as AssignLeadRow[];
        const leadCandidates = leadsBySubmissionId.get(mondayId) ?? [];
        const lead = chooseBestLead(leadCandidates);
        return [
          {
            monday_item_id: mondayId,
            deal_id: d.id ?? null,
            display_name: (d.ghl_name ?? d.deal_name) ?? null,
            phone_number: (lead?.phone_number ?? d.phone_number) ?? null,
            vendor: (lead?.lead_vendor ?? d.call_center) ?? null,
            state: lead?.state ?? null,
            lead_id: lead?.id ?? null,
            carrier: d.carrier ?? null,
          },
        ];
      });

      setRows(combinedRows);

      // Query assignments by deal_id (new schema) using the deals we just fetched
      const dealIds = deals.map((d) => d.id).filter((v): v is number => !!v);
      if (dealIds.length === 0) {
        setAssignments([]);
        return;
      }

      const { data: assignmentData, error: assignmentError } = await supabase
        .from("retention_assigned_leads")
        .select("id, deal_id, assignee_profile_id, status, assigned_at")
        .in("deal_id", dealIds)
        .eq("status", "active");

      if (assignmentError) throw assignmentError;

      const activeAssignments = (assignmentData ?? []) as Array<{
        id: string;
        deal_id: number | null;
        assignee_profile_id: string;
        status: string;
        assigned_at: string;
      }>;

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
            id: a.id,
            lead_id: null,
            assignee_profile_id: a.assignee_profile_id,
            status: a.status,
            assigned_at: a.assigned_at,
            assignee_display_name: nameById.get(a.assignee_profile_id) ?? null,
            // attach deal_id to match later when resolving assignment per row
            deal_id: a.deal_id ?? null,
          })) as AssignmentRow[],
        );
      } else {
        setAssignments([]);
      }
    } catch (error) {
      console.error("[manager-assign-lead] load error", error);
    } finally {
      setLoading(false);
      leadsLoadInFlightRef.current = false;
    }
  }, [groupFilter, page, search, carrierFilter, agentFilter]);

  const loadAvailableCarriers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("monday_com_deals")
        .select("carrier")
        .eq("is_active", true)
        .not("carrier", "is", null);

      if (error) {
        console.error("[manager-assign-lead] loadAvailableCarriers error", error);
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
      console.error("[manager-assign-lead] loadAvailableCarriers error", error);
    }
  }, []);

  const loadAvailableAgents = useCallback(async () => {
    try {
      const { data: assignmentData, error: assignmentError } = await supabase
        .from("retention_assigned_leads")
        .select("assignee_profile_id")
        .eq("status", "active");

      if (assignmentError) {
        console.error("[manager-assign-lead] loadAvailableAgents assignment error", assignmentError);
        return;
      }

      const agentIds = Array.from(
        new Set((assignmentData ?? []).map((a) => a.assignee_profile_id).filter((id): id is string => !!id))
      );

      if (agentIds.length === 0) {
        setAvailableAgents([]);
        return;
      }

      const { data: agentProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", agentIds);

      if (profilesError) {
        console.error("[manager-assign-lead] loadAvailableAgents profiles error", profilesError);
        return;
      }

      const agentNames = Array.from(
        new Set(
          (agentProfiles ?? [])
            .map((p) => (p.display_name as string | null) ?? null)
            .filter((name): name is string => name != null && name.length > 0)
        )
      ).sort();

      setAvailableAgents(["Unassigned", ...agentNames]);
    } catch (error) {
      console.error("[manager-assign-lead] loadAvailableAgents error", error);
    }
  }, []);

  useEffect(() => {
    void loadAvailableCarriers();
  }, [loadAvailableCarriers]);

  useEffect(() => {
    void loadAvailableAgents();
  }, [loadAvailableAgents]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    void loadLeadsAndAssignments();
  }, [loadLeadsAndAssignments]);

  const currentAssignmentForLead = useCallback(
    (leadId: string) => {
      return assignments.find((a) => a.lead_id === leadId) || null;
    },
    [assignments],
  );

  const openUnassignModal = useCallback(
    (row: AssignLeadRow, assignmentId: string) => {
      setActiveUnassign({ row, assignmentId });
      setUnassignOpen(true);
    },
    [],
  );

  const handleConfirmUnassign = useCallback(async () => {
    if (!activeUnassign?.assignmentId) return;
    setUnassigning(true);
    try {
      const { error } = await supabase
        .from("retention_assigned_leads")
        .delete()
        .eq("id", activeUnassign.assignmentId);

      if (error) throw error;

      toast({
        title: "Lead unassigned",
        description: "Assignment removed successfully.",
      });

      setUnassignOpen(false);
      setActiveUnassign(null);
      await loadLeadsAndAssignments({ force: true });
    } catch (err) {
      console.error("[manager-assign-lead] unassign error", err);
      toast({
        title: "Unassign failed",
        description: "Could not unassign lead. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUnassigning(false);
    }
  }, [activeUnassign, loadLeadsAndAssignments, toast]);

  const ensureLeadForRow = useCallback(
    async (row: AssignLeadRow): Promise<string | null> => {
      const submissionId = row.monday_item_id;
      if (!submissionId) return null;

      const { data: existing, error: existingError } = await supabase
        .from("leads")
        .select("id")
        .eq("submission_id", submissionId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing?.id) return existing.id as string;

      const payload: Record<string, unknown> = {
        submission_id: submissionId,
        customer_full_name: row.display_name,
        phone_number: row.phone_number,
        lead_vendor: row.vendor,
        state: row.state,
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertError } = await supabase
        .from("leads")
        .insert(payload)
        .select("id")
        .single();

      if (insertError) throw insertError;
      return inserted?.id ? (inserted.id as string) : null;
    },
    [],
  );

  const openAssignModal = useCallback(
    async (row: AssignLeadRow) => {
      try {
        // Ensure we have a lead record, but prefer checking assignments by deal_id
        if (!row.lead_id) {
          setCreatingLeadFor(row.monday_item_id);
          try {
            const leadId = await ensureLeadForRow(row);
            if (leadId) {
              const updatedRow: AssignLeadRow = { ...row, lead_id: leadId };
              setRows((prev) => prev.map((r) => (r.monday_item_id === row.monday_item_id ? updatedRow : r)));
              row = updatedRow;
            }
          } finally {
            setCreatingLeadFor(null);
          }
        }

        setActiveLead(row);
        // Find existing assignment either by deal_id or lead_id
        const existingAssignment = assignments.find(
          (a) => (row.deal_id && a.deal_id === row.deal_id) || (row.lead_id && a.lead_id === row.lead_id),
        );
        const currentAgentId = existingAssignment?.assignee_profile_id ?? null;
        setOriginalAgentId(currentAgentId);
        setSelectedAgentId(currentAgentId ?? "");
        setModalOpen(true);
      } catch (error) {
        console.error("[manager-assign-lead] ensureLeadForRow error", error);
        toast({
          title: "Unable to assign",
          description: "Failed to prepare lead for assignment. Please try again.",
          variant: "destructive",
        });
      } finally {
        setCreatingLeadFor(null);
      }
    },
    [currentAssignmentForLead, ensureLeadForRow, toast],
  );

  const handleSaveAssignment = async () => {
    if (!activeLead || !selectedAgentId) return;
    if (originalAgentId && selectedAgentId === originalAgentId) return;

    // Get current manager's profile ID (the person doing the assignment)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      toast({
        title: "Error",
        description: "Unable to identify current user. Please refresh and try again.",
        variant: "destructive",
      });
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
      return;
    }

    const managerProfileId = managerProfile.id as string;

    const findDuplicateDealIdsForLead = async (): Promise<number[]> => {
      const phone = (activeLead.phone_number ?? "").toString().trim();
      const name = (activeLead.display_name ?? "").toString().trim();

      if (!phone && !name) return [];

      let q = supabase
        .from("monday_com_deals")
        .select("id")
        .eq("is_active", true)
        .not("monday_item_id", "is", null)
        .limit(5000);

      if (phone) {
        q = q.eq("phone_number", phone);
      } else {
        const escaped = name.replace(/,/g, "");
        q = q.or(`ghl_name.ilike.%${escaped}%,deal_name.ilike.%${escaped}%`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const ids = (data ?? [])
        .map((r) => (typeof (r as { id?: unknown })?.id === "number" ? ((r as { id: number }).id as number) : null))
        .filter((v): v is number => v != null);

      return ids.filter((id) => id !== (activeLead.deal_id ?? null));
    };

    setSaving(true);
    try {
      // Prefer assignment by deal_id (new schema). If we have a deal_id use it, otherwise
      // fallback to assigning by lead_id if the table still supports it (not expected).
      let existingAssignment: { id: number | string } | null = null;

      if (activeLead.deal_id) {
        const { data, error } = await supabase
          .from("retention_assigned_leads")
          .select("id, deal_id")
          .eq("deal_id", activeLead.deal_id)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        existingAssignment = data;
      } else if (activeLead.lead_id) {
        const { data, error } = await supabase
          .from("retention_assigned_leads")
          .select("id, lead_id")
          .eq("lead_id", activeLead.lead_id)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        existingAssignment = data;
      }

      let mutationError: unknown = null;

      if (existingAssignment) {
        const { error } = await supabase
          .from("retention_assigned_leads")
          .update({
            assignee_profile_id: selectedAgentId,
            assigned_by_profile_id: managerProfileId, // Manager who is doing the assignment
            status: "active",
            assigned_at: new Date().toISOString(),
          })
          .eq("id", existingAssignment.id);

        mutationError = error;
      } else {
        const payload: Record<string, unknown> = {
          assignee_profile_id: selectedAgentId,
          assigned_by_profile_id: managerProfileId, // Manager who is doing the assignment
          status: "active",
          assigned_at: new Date().toISOString(),
        };
        if (activeLead.deal_id) payload.deal_id = activeLead.deal_id;
        else if (activeLead.lead_id) payload.lead_id = activeLead.lead_id;

        const { error } = await supabase.from("retention_assigned_leads").insert(payload);
        mutationError = error;
      }

      if (mutationError) throw mutationError;

      // Auto-assign duplicates (same client, different policies) to the same agent.
      // We avoid stealing duplicates already assigned to a different active agent.
      let autoAssigned = 0;
      let alreadyAssignedToOther = 0;

      if (activeLead.deal_id) {
        const duplicateDealIds = await findDuplicateDealIdsForLead();
        if (duplicateDealIds.length) {
          const { data: existingRows, error: existingErr } = await supabase
            .from("retention_assigned_leads")
            .select("id, deal_id, assignee_profile_id, status")
            .in("deal_id", duplicateDealIds)
            .limit(10000);

          if (existingErr) throw existingErr;

          const existingByDealId = new Map<number, { id: string; assignee_profile_id: string; status: string }>();
          for (const r of (existingRows ?? []) as Array<Record<string, unknown>>) {
            const dealId = typeof r.deal_id === "number" ? (r.deal_id as number) : null;
            const id = typeof r.id === "string" ? (r.id as string) : null;
            const assignee = typeof r.assignee_profile_id === "string" ? (r.assignee_profile_id as string) : null;
            const status = typeof r.status === "string" ? (r.status as string) : "";
            if (dealId != null && id && assignee) existingByDealId.set(dealId, { id, assignee_profile_id: assignee, status });
          }

          const now = new Date().toISOString();

          for (const dealId of duplicateDealIds) {
            const existing = existingByDealId.get(dealId) ?? null;

            if (existing && existing.status === "active" && existing.assignee_profile_id !== selectedAgentId) {
              alreadyAssignedToOther += 1;
              continue;
            }

            if (existing) {
              if (existing.assignee_profile_id === selectedAgentId && existing.status === "active") continue;
              const { error } = await supabase
                .from("retention_assigned_leads")
                .update({
                  assignee_profile_id: selectedAgentId,
                  assigned_by_profile_id: managerProfileId, // Manager who is doing the assignment
                  status: "active",
                  assigned_at: now,
                })
                .eq("id", existing.id);
              if (error) throw error;
              autoAssigned += 1;
            } else {
              const { error } = await supabase.from("retention_assigned_leads").insert({
                deal_id: dealId,
                assignee_profile_id: selectedAgentId,
                assigned_by_profile_id: managerProfileId, // Manager who is doing the assignment
                status: "active",
                assigned_at: now,
              });
              if (error) throw error;
              autoAssigned += 1;
            }
          }
        }
      }

      // Refresh assignments by deal_id for current page
      const dealIds = rows.map((r) => r.deal_id).filter((v): v is number => !!v);
      const { data: refreshedAssignments, error: refreshedError } = await supabase
        .from("retention_assigned_leads")
        .select("id, deal_id, assignee_profile_id, status, assigned_at")
        .in("deal_id", dealIds)
        .eq("status", "active");

      if (refreshedError) throw refreshedError;

      const activeAssignments = (refreshedAssignments ?? []) as AssignmentRow[];
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

      // Sync contact to VICIdial (non-blocking)
      if (activeLead.phone_number && selectedAgentId) {
        try {
          const response = await fetch("/api/vicidial/add-lead", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              phone_number: activeLead.phone_number,
              full_name: activeLead.display_name,
              agent_profile_id: selectedAgentId,
              vendor_lead_code: activeLead.deal_id ?? undefined,
              comments: "Assigned from Retention Portal",
            }),
          });

          const result = await response.json();
          if (!response.ok || result.ok === false) {
            console.warn("[VICIdial] Failed to sync lead:", result.error ?? result.raw);
            // Don't show error to user - assignment succeeded, dialer sync is optional
          }
        } catch (vicidialError) {
          console.error("[VICIdial] Error syncing lead:", vicidialError);
          // Silently fail - assignment succeeded
        }
      }

      const assignedAgent = agents.find((a) => a.id === selectedAgentId);
      toast({
        title: "Lead assigned",
        description:
          assignedAgent && activeLead.display_name
            ? `${activeLead.display_name} assigned to ${assignedAgent.display_name ?? "agent"}` +
              (autoAssigned || alreadyAssignedToOther
                ? ` • Auto-assigned ${autoAssigned} duplicate policy(s)` +
                  (alreadyAssignedToOther ? ` (skipped ${alreadyAssignedToOther} already assigned)` : "")
                : "")
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAgents();
      await loadLeadsAndAssignments({ force: true });
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

              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Select
                  value={groupFilter}
                  onValueChange={(v) => {
                    setGroupFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[260px]">
                    <SelectValue placeholder="All Groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Groups</SelectItem>
                    {DEAL_GROUPS.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <MultiSelect
                  options={availableCarriers}
                  selected={carrierFilter}
                  onChange={(selected) => {
                    setCarrierFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All Carriers"
                  className="w-full lg:w-[200px]"
                  showAllOption={true}
                  allOptionLabel="All Carriers"
                />
                <MultiSelect
                  options={availableAgents}
                  selected={agentFilter}
                  onChange={(selected) => {
                    setAgentFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All Agents"
                  className="w-full lg:w-[200px]"
                  showAllOption={true}
                  allOptionLabel="All Agents"
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="lg:ml-auto"
                onClick={handleRefresh}
                disabled={loading || saving || refreshing}
                title="Manually refresh data"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilterIcon className="h-4 w-4" />}
              </Button>

              <Button
                variant="default"
                onClick={() => setBulkAssignOpen(true)}
                disabled={loading || saving || refreshing}
              >
                Bulk Assign
              </Button>

              <Button
                variant="destructive"
                onClick={() => setBulkUnassignOpen(true)}
                disabled={loading || saving || refreshing}
              >
                Bulk Unassign
              </Button>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_minmax(100px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(170px,auto)] gap-4 p-3 text-sm font-medium text-muted-foreground">
                <div>Name</div>
                <div>Phone</div>
                <div>Carrier</div>
                <div>Vendor / State</div>
                <div>Assigned Agent</div>
                <div className="text-right">Actions</div>
              </div>
              {loading ? (
                <div className="border-t p-6 flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading leads...
                </div>
              ) : rows.length === 0 ? (
                <div className="border-t p-3 text-sm text-muted-foreground">No leads found.</div>
              ) : (
                rows.map((row) => {
                    const assignment = assignments.find((a) => (row.lead_id && a.lead_id === row.lead_id) || (row.deal_id && a.deal_id === row.deal_id)) || null;
                    const isCreating = creatingLeadFor === row.monday_item_id;
                  return (
                    <div
                      key={row.monday_item_id}
                      className="grid grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_minmax(100px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(170px,auto)] gap-4 p-3 text-sm items-center border-t bg-background/40"
                    >
                      <div className="min-w-0 truncate" title={row.display_name ?? undefined}>
                        <span className="font-medium">{row.display_name ?? "Unknown"}</span>
                        {row.monday_item_id ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            #{row.monday_item_id}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate" title={row.phone_number ?? undefined}>
                        {row.phone_number ?? "-"}
                      </div>
                      <div className="truncate" title={row.carrier ?? undefined}>
                        {row.carrier ?? "-"}
                      </div>
                      <div className="truncate">
                        {row.vendor ?? "-"} {row.state ? `(${row.state})` : ""}
                      </div>
                      <div className="min-w-0">
                        {assignment?.assignee_display_name ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {assignment.assignee_display_name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        {assignment?.id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            onClick={() => openUnassignModal(row, assignment.id)}
                            disabled={loading || saving || refreshing || isCreating}
                          >
                            Unassign
                          </Button>
                        ) : null}

                        <Button
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => openAssignModal(row)}
                          disabled={loading || saving || refreshing || isCreating}
                        >
                          {isCreating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing...
                            </>
                          ) : assignment ? (
                            "Change"
                          ) : (
                            "Assign"
                          )}
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              {activeLead ? (
                <>
                  Assigning <span className="font-medium">{activeLead.display_name}</span>
                  {activeLead.monday_item_id ? ` (Submission: ${activeLead.monday_item_id})` : null}
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

      <Dialog open={unassignOpen} onOpenChange={setUnassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            {activeUnassign?.row ? (
              <>
                This will remove the assignment for
                <span className="font-medium text-foreground"> {activeUnassign.row.display_name ?? "this lead"}</span>.
              </>
            ) : (
              "No lead selected."
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnassignOpen(false)} disabled={unassigning}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmUnassign} disabled={unassigning || !activeUnassign}>
              {unassigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Unassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkAssignModal
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        agents={agents}
        onCompleted={() => {
          void handleRefresh();
        }}
      />

      <BulkUnassignModal
        open={bulkUnassignOpen}
        onOpenChange={setBulkUnassignOpen}
        agents={agents}
        onCompleted={() => {
          void handleRefresh();
        }}
      />
    </div>
  );
}
