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
import { supabase } from "@/lib/supabase";
import { Loader2, EyeIcon, ChevronDown, ChevronRight } from "lucide-react";
import { getDealLabelStyle, getDealTagLabelFromGhlStage } from "@/lib/monday-deal-category-tags";
import { DISPOSITION_METADATA } from "@/lib/dispositions/rules";

type AssignedLeadRow = {
  id: string;
  lead_id?: string | null;
  deal_id?: number | null;
  status: string;
  assigned_at: string;
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
  const [dispositionFilter, setDispositionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [assignedLeads, setAssignedLeads] = useState<AssignedLeadRow[]>([]);
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
  }, [PAGE_SIZE, totalCount, isSearching]);

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

      const from = isSearching ? 0 : (page - 1) * PAGE_SIZE;
      const to = from + (isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE) - 1;

      let assignmentsQuery = supabase
        .from("retention_assigned_leads")
        .select("id, deal_id, status, assigned_at", { count: "exact" })
        .eq("assignee_profile_id", profile.id)
        .eq("status", "active")
        .order("assigned_at", { ascending: false });

      if (isSearching) {
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

      setAssignedLeads(
        assignments.map((a) => {
          const deal = typeof a.deal_id === "number" ? dealById.get(a.deal_id) ?? null : null;
          const sub = deal && typeof deal.monday_item_id === "string" ? deal.monday_item_id.trim() : "";
          const resolvedLead = sub ? leadsBySubmission.get(sub) ?? null : null;

          return {
            ...a,
            // Keep lead_id only for navigation to lead details. Display is sourced from monday_com_deals.
            lead_id: resolvedLead?.id ?? null,
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
            // Optional: lead info is not required for this list view.
            lead: null,
          };
        }),
      );
    } catch (error) {
      console.error("[agent-assigned-leads] load error", error);
      setAssignedLeads([]);
      setTotalCount(null);
    } finally {
      setLoading(false);
    }
  }, [PAGE_SIZE, SEARCH_FETCH_LIMIT, isSearching, page]);

  useEffect(() => {
    void loadAssignedLeads();
  }, [loadAssignedLeads]);

  const filteredLeads = useMemo(() => {
    const q = trimmedSearch.toLowerCase();
    return assignedLeads.filter((row) => {
      const nameOk =
        !trimmedSearch ||
        (row.lead?.customer_full_name ?? row.deal?.ghl_name ?? row.deal?.deal_name ?? "")
          .toLowerCase()
          .includes(q);

      const dispoOk =
        dispositionFilter === "all" ||
        (row.deal?.disposition ?? "") === dispositionFilter;

      return nameOk && dispoOk;
    });
  }, [assignedLeads, dispositionFilter, trimmedSearch]);

  const allDispositionOptions = useMemo(() => {
    return Object.keys(DISPOSITION_METADATA).sort((a, b) => a.localeCompare(b));
  }, []);

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

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="w-full">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <CardDescription>
                  List view with essential lead data (Name, Status, Last Contact Date).
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                placeholder="Search by name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <Select
                value={dispositionFilter}
                onValueChange={(v) => {
                  setDispositionFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="sm:w-[260px]">
                  <SelectValue placeholder="Filter by disposition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dispositions</SelectItem>
                  {allDispositionOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DISPOSITION_METADATA[d as keyof typeof DISPOSITION_METADATA].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button variant="secondary" type="button" disabled>
                  Smart Filters
                </Button>
                <Button type="button" onClick={() => void loadAssignedLeads()} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid gap-3 p-3 text-sm font-medium text-muted-foreground" style={{ gridTemplateColumns: "2.5fr 1fr 1fr 0.8fr" }}>
                <div>GHL Name</div>
                <div>Center</div>
                <div>Disposition</div>
                <div className="text-right">Actions</div>
              </div>
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No leads found.</div>
              ) : (
                groupedLeads.map((group) => {
                  const isExpanded = expandedGroups.has(group.name);
                  const primaryLead = group.leads[0];
                  const ghlName = primaryLead.lead?.customer_full_name ?? primaryLead.deal?.ghl_name ?? primaryLead.deal?.deal_name ?? "Unknown";
                  
                  return (
                    <React.Fragment key={group.name}>
                      <div className="grid gap-3 p-3 text-sm items-center border-t" style={{ gridTemplateColumns: "2.5fr 1fr 1fr 0.8fr" }}>
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
                        <div className="truncate" title={(primaryLead.lead?.lead_vendor ?? primaryLead.deal?.call_center) ?? undefined}>
                          {primaryLead.lead?.lead_vendor ?? primaryLead.deal?.call_center ?? "-"}
                        </div>
                        <div className="truncate" title={primaryLead.deal?.disposition ?? undefined}>
                          {primaryLead.deal?.disposition ? (
                            <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {primaryLead.deal.disposition}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <div className="flex flex-col items-end justify-center gap-2">
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
                        </div>
                      </div>
                      
                      {group.isDuplicate && isExpanded ? (
                        group.leads.slice(1).map((row) => {
                          const duplicateGhlName = row.lead?.customer_full_name ?? row.deal?.ghl_name ?? row.deal?.deal_name ?? "Unknown";
                          const viewHref = `/agent/assigned-lead-details?dealId=${encodeURIComponent(String(row.deal_id ?? ""))}`;
                          const label = getDealTagLabelFromGhlStage(row.deal?.ghl_stage ?? null);
                          const style = getDealLabelStyle(label);
                          
                          return (
                            <div key={row.id} className="grid gap-3 p-3 text-sm items-center border-t bg-muted/30" style={{ gridTemplateColumns: "2.5fr 1fr 1fr 0.8fr" }}>
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
                              <div className="truncate" title={(row.lead?.lead_vendor ?? row.deal?.call_center) ?? undefined}>
                                {row.lead?.lead_vendor ?? row.deal?.call_center ?? "-"}
                              </div>
                              <div className="truncate" title={row.deal?.disposition ?? undefined}>
                                {row.deal?.disposition ? (
                                  <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                    {row.deal.disposition}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                              <div className="flex flex-col items-end justify-center gap-2">
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
