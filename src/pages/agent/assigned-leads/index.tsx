"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { supabase } from "@/lib/supabase";
import { Loader2, EyeIcon, ChevronDown, ChevronRight, Filter } from "lucide-react";
import { getDealLabelStyle, getDealTagLabelFromGhlStage, getDealCategoryAndTagFromGhlStage, CATEGORY_ORDER, type DealCategory } from "@/lib/monday-deal-category-tags";
import { AssignedLeadsSkeleton } from "@/components/loading-skeletons";
import { shouldHideLeadAfterHours } from "@/lib/agent/after-hours-filter";

type AssignedLeadRow = {
  id: string;
  lead_id?: string | null;
  deal_id?: number | null;
  status: string;
  assigned_at: string;
  isHandled?: boolean;
  deal?: {
    monday_item_id: string | null;
    ghl_name: string | null;
    deal_name: string | null;
    ghl_stage?: string | null;
    phone_number: string | null;
    call_center: string | null;
    carrier: string | null;
    policy_type: string | null;
    last_updated: string | null;
    disposition: string | null;
  } | null;
  lead?: {
    customer_full_name: string | null;
    carrier: string | null;
    product_type: string | null;
    phone_number: string | null;
    lead_vendor: string | null;
    created_at: string | null;
  } | null;
};

type DealRow = {
  id: number;
  monday_item_id: string | null;
  ghl_name: string | null;
  deal_name: string | null;
  ghl_stage?: string | null;
  phone_number: string | null;
  call_center: string | null;
  carrier: string | null;
  policy_type: string | null;
  last_updated: string | null;
  disposition: string | null;
};

type LeadDbRow = {
  id: string;
  submission_id: string | null;
  customer_full_name: string | null;
  carrier: string | null;
  product_type: string | null;
  phone_number: string | null;
  lead_vendor: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

const normalizeName = (value: string | null | undefined) => {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getNameSignature = (value: string | null | undefined) => {
  const normalized = normalizeName(value);
  if (!normalized) return "";
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
  const firstKey = first.slice(0, 3);
  const lastKey = last.slice(0, 3);
  return `${firstKey}|${lastKey}`;
};

export default function AssignedLeadsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [carrierFilter, setCarrierFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<DealCategory[]>([]);
  const [assignedDateFilter, setAssignedDateFilter] = useState<string>("all");
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignedLeads, setAssignedLeads] = useState<AssignedLeadRow[]>([]);
  const [handledLeads, setHandledLeads] = useState<AssignedLeadRow[]>([]);
  const [activeTab, setActiveTab] = useState<"assigned" | "handled">("assigned");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const PAGE_SIZE = 25;
  const SEARCH_FETCH_LIMIT = 500;

  const trimmedSearch = search.trim();
  const isSearching = trimmedSearch.length > 0;

  const pageCount = useMemo(() => {
    if (isSearching) return 1;
    if (!totalCount) return 1;
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  }, [totalCount, isSearching]);

  // Use refs to track current values without causing re-renders
  const searchRef = React.useRef(search);
  const pageRef = React.useRef(page);
  
  React.useEffect(() => {
    searchRef.current = search;
    pageRef.current = page;
  }, [search, page]);

  const loadAssignedLeads = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setAssignedLeads([]);
        setTotalCount(null);
        return;
      }

      // In this schema, profiles link to auth.users via the user_id column.
      // Use user_id to find the current agent's profile.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (profileError || !profile) {
        console.error("[agent-assigned-leads] profile lookup error", profileError);
        setAssignedLeads([]);
        setTotalCount(null);
        return;
      }

      // Use ref values to avoid dependency issues
      const currentSearch = searchRef.current.trim();
      const currentIsSearching = currentSearch.length > 0;
      const currentPage = pageRef.current;

      const from = currentIsSearching ? 0 : (currentPage - 1) * PAGE_SIZE;
      const to = from + (currentIsSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE) - 1;

      let assignmentsQuery = supabase
        .from("retention_assigned_leads")
        .select("id, deal_id, status, assigned_at", { count: "exact" })
        .eq("assignee_profile_id", profile.id)
        .eq("status", "active")
        .order("assigned_at", { ascending: false });

      if (currentIsSearching) {
        assignmentsQuery = assignmentsQuery.limit(SEARCH_FETCH_LIMIT);
      } else {
        assignmentsQuery = assignmentsQuery.range(from, to);
      }

      const { data: assignmentRows, error: assignmentError, count } = await assignmentsQuery;

      if (assignmentError) {
        console.error("[agent-assigned-leads] assignments error", assignmentError);
        setAssignedLeads([]);
        setTotalCount(null);
        return;
      }

      const assignments = (assignmentRows ?? []) as AssignedLeadRow[];
      setTotalCount(typeof count === "number" ? count : null);

      if (assignments.length === 0) {
        setAssignedLeads([]);
        setTotalCount(typeof count === "number" ? count : null);
        return;
      }

      const dealIds = assignments
        .map((a) => (typeof a.deal_id === "number" ? a.deal_id : null))
        .filter((v): v is number => v != null);

      let deals: DealRow[] = [];
      if (dealIds.length > 0) {
        const { data: dealRows, error: dealsError } = await supabase
          .from("monday_com_deals")
          .select("id,monday_item_id,ghl_name,deal_name,ghl_stage,phone_number,call_center,carrier,policy_type,last_updated,disposition")
          .eq("is_active", true)
          .in("id", dealIds)
          .limit(5000);

        if (dealsError) {
          console.error("[agent-assigned-leads] monday deals error", dealsError);
        } else {
          deals = (dealRows ?? []) as DealRow[];
        }
      }

      const dealById = new Map<number, DealRow>();
      for (const d of deals) dealById.set(d.id, d);

      const submissionIds = Array.from(
        new Set(
          deals
            .map((d) => (typeof d.monday_item_id === "string" ? d.monday_item_id.trim() : ""))
            .filter((v) => v.length > 0),
        ),
      );

      const leadsBySubmission = new Map<string, LeadDbRow>();
      if (submissionIds.length > 0) {
        const { data: leadRows, error: leadsError } = await supabase
          .from("leads")
          .select("id, submission_id, customer_full_name, carrier, product_type, phone_number, lead_vendor, created_at, updated_at")
          .in("submission_id", submissionIds)
          .limit(10000);

        if (leadsError) {
          console.error("[agent-assigned-leads] leads lookup by submission_id error", leadsError);
        } else {
          for (const r of (leadRows ?? []) as LeadDbRow[]) {
            const sub = typeof r.submission_id === "string" ? r.submission_id.trim() : "";
            if (!sub) continue;
            if (!leadsBySubmission.has(sub)) {
              leadsBySubmission.set(sub, r);
              continue;
            }
            const existing = leadsBySubmission.get(sub);
            const tExisting = Date.parse(existing?.updated_at || existing?.created_at || "") || 0;
            const tNext = Date.parse(r.updated_at || r.created_at || "") || 0;
            if (tNext > tExisting) leadsBySubmission.set(sub, r);
          }
        }
      }

      // Get agent name for checking handled leads
      const { data: agentProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", profile.id)
        .maybeSingle();

      const agentName = agentProfile?.display_name;

      // Get all handled submission IDs for this agent
      let handledSubmissionIds = new Set<string>();
      if (agentName) {
        const { data: handledData } = await supabase
          .from("retention_deal_flow")
          .select("submission_id")
          .eq("retention_agent", agentName);

        handledSubmissionIds = new Set(
          (handledData ?? []).map((h) => (h.submission_id as string)?.trim()).filter(Boolean)
        );
      }

      const leads = assignments.map((a) => {
        const deal = typeof a.deal_id === "number" ? dealById.get(a.deal_id) ?? null : null;
        const sub = deal && typeof deal.monday_item_id === "string" ? deal.monday_item_id.trim() : "";
        const resolvedLead = sub ? leadsBySubmission.get(sub) ?? null : null;
        const isHandled = sub ? handledSubmissionIds.has(sub) : false;

        return {
          ...a,
          // Keep lead_id only for navigation to lead details. Display is sourced from monday_com_deals.
          lead_id: resolvedLead?.id ?? null,
          isHandled,
          deal: deal
            ? {
                monday_item_id: deal.monday_item_id ?? null,
                ghl_name: deal.ghl_name ?? null,
                deal_name: deal.deal_name ?? null,
                ghl_stage: deal.ghl_stage ?? null,
                phone_number: deal.phone_number ?? null,
                call_center: deal.call_center ?? null,
                carrier: deal.carrier ?? null,
                policy_type: deal.policy_type ?? null,
                last_updated: deal.last_updated ?? null,
                disposition: deal.disposition ?? null,
              }
            : null,
          lead: resolvedLead
            ? {
                customer_full_name: resolvedLead.customer_full_name ?? null,
                carrier: resolvedLead.carrier ?? null,
                product_type: resolvedLead.product_type ?? null,
                phone_number: resolvedLead.phone_number ?? null,
                lead_vendor: resolvedLead.lead_vendor ?? null,
                created_at: resolvedLead.created_at ?? null,
              }
            : null,
        };
      });

      // Separate assigned and handled leads
      const assigned = leads.filter((l) => !l.isHandled);
      const handled = leads.filter((l) => l.isHandled);

      setAssignedLeads(assigned);
      setHandledLeads(handled);
    } catch (error) {
      console.error("[agent-assigned-leads] load error", error);
      setAssignedLeads([]);
      setTotalCount(null);
    } finally {
      setLoading(false);
    }
  }, []); // Empty deps - uses refs for current values

  // Load available carriers from all assigned leads (not just current page)
  const loadAvailableCarriers = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setAvailableCarriers([]);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (profileError || !profile) {
        setAvailableCarriers([]);
        return;
      }

      // Get all deal IDs assigned to this agent
      const { data: allAssignments, error: assignmentsError } = await supabase
        .from("retention_assigned_leads")
        .select("deal_id")
        .eq("assignee_profile_id", profile.id)
        .eq("status", "active")
        .limit(10000);

      if (assignmentsError || !allAssignments || allAssignments.length === 0) {
        setAvailableCarriers([]);
        return;
      }

      const allDealIds = allAssignments
        .map((a) => (typeof a.deal_id === "number" ? a.deal_id : null))
        .filter((v): v is number => v != null);

      if (allDealIds.length === 0) {
        setAvailableCarriers([]);
        return;
      }

      // Fetch carriers from deals
      const { data: dealRows, error: dealsError } = await supabase
        .from("monday_com_deals")
        .select("carrier")
        .eq("is_active", true)
        .in("id", allDealIds)
        .not("carrier", "is", null)
        .limit(10000);

      if (dealsError) {
        console.error("[agent-assigned-leads] error loading carriers", dealsError);
        setAvailableCarriers([]);
        return;
      }

      // Also check leads table for carriers
      const { data: dealRowsForLeads } = await supabase
        .from("monday_com_deals")
        .select("monday_item_id")
        .eq("is_active", true)
        .in("id", allDealIds)
        .not("monday_item_id", "is", null)
        .limit(10000);

      const submissionIds = Array.from(
        new Set(
          (dealRowsForLeads ?? [])
            .map((d) => (typeof d.monday_item_id === "string" ? d.monday_item_id.trim() : ""))
            .filter((v) => v.length > 0),
        ),
      );

      let leadCarriers: string[] = [];
      if (submissionIds.length > 0) {
        const { data: leadRows } = await supabase
          .from("leads")
          .select("carrier")
          .in("submission_id", submissionIds)
          .not("carrier", "is", null)
          .limit(10000);

        leadCarriers = (leadRows ?? [])
          .map((r) => (typeof r.carrier === "string" ? r.carrier.trim() : ""))
          .filter((v) => v.length > 0);
      }

      const carriers = new Set<string>();
      
      // Add carriers from deals
      for (const row of dealRows ?? []) {
        const carrier = typeof row.carrier === "string" ? row.carrier.trim() : "";
        if (carrier) carriers.add(carrier);
      }

      // Add carriers from leads
      for (const carrier of leadCarriers) {
        if (carrier) carriers.add(carrier);
      }

      setAvailableCarriers(Array.from(carriers).sort());
    } catch (error) {
      console.error("[agent-assigned-leads] error loading available carriers", error);
      setAvailableCarriers([]);
    }
  }, []);

  // Trigger load when search, page, or tab changes
  useEffect(() => {
    void loadAssignedLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, activeTab]);

  // Load available carriers on mount and when leads change
  useEffect(() => {
    void loadAvailableCarriers();
  }, [loadAvailableCarriers]);

  const filteredLeads = useMemo(() => {
    const sourceLeads = activeTab === "assigned" ? assignedLeads : handledLeads;
    const q = trimmedSearch.toLowerCase();
    return sourceLeads.filter((row) => {
      // Hide leads after 5 PM if they match the criteria
      const shouldHide = shouldHideLeadAfterHours(
        row.deal?.ghl_stage ?? null,
        row.deal?.carrier ?? null
      );
      if (shouldHide) {
        return false;
      }

      // Search filter
      const nameOk =
        !trimmedSearch ||
        (row.lead?.customer_full_name ?? row.deal?.ghl_name ?? row.deal?.deal_name ?? "")
          .toLowerCase()
          .includes(q) ||
        (row.lead?.phone_number ?? row.deal?.phone_number ?? "")
          .replace(/\D/g, "")
          .includes(q.replace(/\D/g, ""));

      if (!nameOk) return false;

      // Carrier filter
      if (carrierFilter.length > 0) {
        const carrier = (row.lead?.carrier ?? row.deal?.carrier ?? "").trim();
        if (!carrier || !carrierFilter.includes(carrier)) {
          return false;
        }
      }

      // Stage filter (category-based)
      if (stageFilter.length > 0) {
        const stage = row.deal?.ghl_stage ?? null;
        const categoryMapping = getDealCategoryAndTagFromGhlStage(stage);
        const category = categoryMapping?.category ?? null;
        
        if (!category || !stageFilter.includes(category)) {
          return false;
        }
      }

      // Assigned date filter
      if (assignedDateFilter !== "all" && row.assigned_at) {
        const assignedDate = new Date(row.assigned_at);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - assignedDate.getTime()) / (1000 * 60 * 60 * 24));

        if (assignedDateFilter === "today" && daysDiff !== 0) return false;
        if (assignedDateFilter === "yesterday" && daysDiff !== 1) return false;
        if (assignedDateFilter === "last7days" && daysDiff >= 7) return false;
        if (assignedDateFilter === "last30days" && daysDiff >= 30) return false;
        if (assignedDateFilter === "older" && daysDiff < 30) return false;
      }

      return true;
    });
  }, [assignedLeads, trimmedSearch, carrierFilter, stageFilter, assignedDateFilter]);

  const groupedLeads = useMemo(() => {
    const groups = new Map<string, AssignedLeadRow[]>();
    
    for (const lead of filteredLeads) {
      const rawName = lead.lead?.customer_full_name ?? lead.deal?.ghl_name ?? lead.deal?.deal_name ?? "";
      const nameSignature = getNameSignature(rawName);
      const phoneDigits = (lead.lead?.phone_number ?? lead.deal?.phone_number ?? "")
        .replace(/\D/g, "")
        .trim();
      
      let groupKey: string;
      if (phoneDigits && nameSignature) {
        groupKey = `${phoneDigits}|${nameSignature}`;
      } else if (phoneDigits) {
        // Require matching name info to group by phone; otherwise keep entry unique.
        groupKey = `${phoneDigits}|${lead.id}`;
      } else if (nameSignature) {
        groupKey = `name-${nameSignature}`;
      } else {
        groupKey = `row-${lead.id}`;
      }
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(lead);
    }
    
    return Array.from(groups.entries()).map(([name, leads]) => ({
      name,
      leads,
      isDuplicate: leads.length > 1,
    }));
  }, [filteredLeads]);

  const navigationContext = useMemo(() => {
    const dealIds: number[] = [];
    const dealIdToPrimaryDealId: Record<string, number> = {};

    for (const group of groupedLeads) {
      const primary = group.leads[0];
      const primaryDealId = typeof primary?.deal_id === "number" ? primary.deal_id : null;
      if (!primaryDealId) continue;
      dealIds.push(primaryDealId);

      for (const row of group.leads) {
        const did = typeof row?.deal_id === "number" ? row.deal_id : null;
        if (!did) continue;
        dealIdToPrimaryDealId[String(did)] = primaryDealId;
      }
    }

    return { dealIds, dealIdToPrimaryDealId };
  }, [groupedLeads]);

  const toggleGroup = useCallback((groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }, []);

  if (loading && assignedLeads.length === 0) {
    return <AssignedLeadsSkeleton />;
  }

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="w-full">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border p-1">
                    <Button
                      variant={activeTab === "assigned" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => {
                        setActiveTab("assigned");
                        setPage(1);
                      }}
                    >
                      Assigned ({assignedLeads.length})
                    </Button>
                    <Button
                      variant={activeTab === "handled" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => {
                        setActiveTab("handled");
                        setPage(1);
                      }}
                    >
                      Handled ({handledLeads.length})
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  {activeTab === "assigned" 
                    ? "Leads assigned to you that need to be handled"
                    : "Leads you have already handled"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  placeholder="Search by name or phone..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  disabled={loading}
                  className="flex-1"
                />
                <Button type="button" onClick={() => void loadAssignedLeads()} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
              </div>
              
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground hidden sm:inline">Filters:</span>
                </div>
                
                <MultiSelect
                  options={availableCarriers}
                  selected={carrierFilter}
                  onChange={(selected) => {
                    setCarrierFilter(selected);
                    setPage(1);
                  }}
                  placeholder="All Carriers"
                  className="w-full sm:w-[180px]"
                  showAllOption={true}
                  allOptionLabel="All Carriers"
                />
                
                <MultiSelect
                  options={CATEGORY_ORDER}
                  selected={stageFilter}
                  onChange={(selected) => {
                    setStageFilter(selected as DealCategory[]);
                    setPage(1);
                  }}
                  placeholder="All Categories"
                  className="w-full sm:w-[200px]"
                  showAllOption={true}
                  allOptionLabel="All Categories"
                />
                
                <Select
                  value={assignedDateFilter}
                  onValueChange={(v) => {
                    setAssignedDateFilter(v);
                    setPage(1);
                  }}
                  disabled={loading}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="All Dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7days">Last 7 Days</SelectItem>
                    <SelectItem value="last30days">Last 30 Days</SelectItem>
                    <SelectItem value="older">Older than 30 Days</SelectItem>
                  </SelectContent>
                </Select>

                {(carrierFilter.length > 0 || stageFilter.length > 0 || assignedDateFilter !== "all") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCarrierFilter([]);
                      setStageFilter([]);
                      setAssignedDateFilter("all");
                      setPage(1);
                    }}
                    className="text-xs"
                  >
                    Clear All
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid gap-3 p-3 text-sm font-medium text-muted-foreground" style={{ gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.9fr" }}>
                <div>GHL Name</div>
                <div>Phone</div>
                <div>Carrier</div>
                <div>Assigned</div>
                <div className="text-right">Actions</div>
              </div>
              {loading && assignedLeads.length > 0 ? (
                <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing...
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No leads found.</div>
              ) : (
                groupedLeads.map((group) => {
                  const isExpanded = expandedGroups.has(group.name);
                  const primaryLead = group.leads[0];
                  const ghlName = primaryLead.lead?.customer_full_name ?? primaryLead.deal?.ghl_name ?? primaryLead.deal?.deal_name ?? "Unknown";
                  
                  return (
                    <React.Fragment key={group.name}>
                      <div className="grid gap-3 p-3 text-sm items-center border-t" style={{ gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.9fr" }}>
                        <div className="flex items-center gap-2">
                          {group.isDuplicate ? (
                            <button
                              type="button"
                              onClick={() => toggleGroup(group.name)}
                              className="shrink-0 hover:bg-muted rounded p-0.5"
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="size-4 text-muted-foreground" />
                              )}
                            </button>
                          ) : (
                            <div className="w-5" />
                          )}
                          <div className="truncate" title={ghlName}>
                            {ghlName}
                            {group.isDuplicate ? (
                              <span className="ml-2 text-xs text-muted-foreground">({group.leads.length})</span>
                            ) : null}
                          </div>
                          {(() => {
                            const label = getDealTagLabelFromGhlStage(primaryLead.deal?.ghl_stage ?? null);
                            const style = getDealLabelStyle(label);
                            if (!label || !style) return null;
                            return (
                              <span
                                className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                                style={{ backgroundColor: style.bg, borderColor: style.border, color: style.text }}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="truncate font-mono text-xs" title={(primaryLead.lead?.phone_number ?? primaryLead.deal?.phone_number) ?? undefined}>
                          {(() => {
                            const phone = primaryLead.lead?.phone_number ?? primaryLead.deal?.phone_number ?? "";
                            if (!phone) return <span className="text-muted-foreground">—</span>;
                            // Format phone number for display
                            const digits = phone.replace(/\D/g, "");
                            if (digits.length === 10) {
                              return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
                            }
                            return phone;
                          })()}
                        </div>
                        <div className="truncate" title={(primaryLead.lead?.carrier ?? primaryLead.deal?.carrier) ?? undefined}>
                          {primaryLead.lead?.carrier ?? primaryLead.deal?.carrier ?? <span className="text-muted-foreground">—</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground" title={primaryLead.assigned_at ? new Date(primaryLead.assigned_at).toLocaleString() : undefined}>
                          {(() => {
                            if (!primaryLead.assigned_at) return <span>—</span>;
                            const assignedDate = new Date(primaryLead.assigned_at);
                            const now = new Date();
                            const daysDiff = Math.floor((now.getTime() - assignedDate.getTime()) / (1000 * 60 * 60 * 24));
                            
                            if (daysDiff === 0) return "Today";
                            if (daysDiff === 1) return "Yesterday";
                            if (daysDiff < 7) return `${daysDiff}d ago`;
                            return assignedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                          })()}
                        </div>
                        <div className="flex flex-col items-end justify-center gap-2">
                          {activeTab === "assigned" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => {
                              try {
                                sessionStorage.setItem(
                                  "assignedLeadsNavigationContext",
                                  JSON.stringify({
                                    dealIds: navigationContext.dealIds,
                                    dealIdToPrimaryDealId: navigationContext.dealIdToPrimaryDealId,
                                    createdAt: Date.now(),
                                  }),
                                );
                              } catch {
                                // ignore
                              }
                              const viewHref = `/agent/assigned-lead-details?dealId=${encodeURIComponent(String(primaryLead.deal_id ?? ""))}`;
                              void router.push(viewHref);
                            }}
                          >
                            <EyeIcon className="size-4" />
                            View
                          </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled
                              title="This lead has already been handled"
                            >
                              <EyeIcon className="size-4" />
                              Handled
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {group.isDuplicate && isExpanded ? (
                        group.leads.slice(1).map((row) => {
                          const duplicateGhlName = row.lead?.customer_full_name ?? row.deal?.ghl_name ?? row.deal?.deal_name ?? "Unknown";
                          const viewHref = `/agent/assigned-lead-details?dealId=${encodeURIComponent(String(row.deal_id ?? ""))}`;
                          const label = getDealTagLabelFromGhlStage(row.deal?.ghl_stage ?? null);
                          const style = getDealLabelStyle(label);
                          
                          return (
                            <div key={row.id} className="grid gap-3 p-3 text-sm items-center border-t bg-muted/30" style={{ gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.9fr" }}>
                              <div className="flex items-center gap-2">
                                <div className="w-5" />
                                <div className="truncate" title={duplicateGhlName}>
                                  {duplicateGhlName}
                                </div>
                                {label && style ? (
                                  <span
                                    className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                                    style={{ backgroundColor: style.bg, borderColor: style.border, color: style.text }}
                                  >
                                    {label}
                                  </span>
                                ) : null}
                              </div>
                              <div className="truncate font-mono text-xs" title={(row.lead?.phone_number ?? row.deal?.phone_number) ?? undefined}>
                                {(() => {
                                  const phone = row.lead?.phone_number ?? row.deal?.phone_number ?? "";
                                  if (!phone) return <span className="text-muted-foreground">—</span>;
                                  // Format phone number for display
                                  const digits = phone.replace(/\D/g, "");
                                  if (digits.length === 10) {
                                    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
                                  }
                                  return phone;
                                })()}
                              </div>
                              <div className="truncate" title={(row.lead?.carrier ?? row.deal?.carrier) ?? undefined}>
                                {row.lead?.carrier ?? row.deal?.carrier ?? <span className="text-muted-foreground">—</span>}
                              </div>
                              <div className="truncate text-xs text-muted-foreground" title={row.assigned_at ? new Date(row.assigned_at).toLocaleString() : undefined}>
                                {(() => {
                                  if (!row.assigned_at) return <span>—</span>;
                                  const assignedDate = new Date(row.assigned_at);
                                  const now = new Date();
                                  const daysDiff = Math.floor((now.getTime() - assignedDate.getTime()) / (1000 * 60 * 60 * 24));
                                  
                                  if (daysDiff === 0) return "Today";
                                  if (daysDiff === 1) return "Yesterday";
                                  if (daysDiff < 7) return `${daysDiff}d ago`;
                                  return assignedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                })()}
                              </div>
                              <div className="flex flex-col items-end justify-center gap-2">
                                {activeTab === "assigned" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => {
                                    try {
                                      sessionStorage.setItem(
                                        "assignedLeadsNavigationContext",
                                        JSON.stringify({
                                          dealIds: navigationContext.dealIds,
                                          dealIdToPrimaryDealId: navigationContext.dealIdToPrimaryDealId,
                                          createdAt: Date.now(),
                                        }),
                                      );
                                    } catch {
                                      // ignore
                                    }
                                    void router.push(viewHref);
                                  }}
                                >
                                  <EyeIcon className="size-4" />
                                  View
                                </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    disabled
                                    title="This lead has already been handled"
                                  >
                                    <EyeIcon className="size-4" />
                                    Handled
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
              <div>
                Page {page} of {pageCount}
                {typeof totalCount === "number" ? (
                  <>
                    <span className="mx-2">•</span>
                    Total: {totalCount}
                  </>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
