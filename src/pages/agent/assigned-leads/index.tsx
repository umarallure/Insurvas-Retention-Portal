"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, EyeIcon } from "lucide-react";

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
    phone_number: string | null;
    call_center: string | null;
    carrier: string | null;
    policy_type: string | null;
    last_updated: string | null;
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
  phone_number: string | null;
  call_center: string | null;
  carrier: string | null;
  policy_type: string | null;
  last_updated: string | null;
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

export default function AssignedLeadsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [assignedLeads, setAssignedLeads] = useState<AssignedLeadRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const PAGE_SIZE = 25;

  const pageCount = useMemo(() => {
    if (!totalCount) return 1;
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  }, [PAGE_SIZE, totalCount]);

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

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: assignmentRows, error: assignmentError, count } = await supabase
        .from("retention_assigned_leads")
        .select("id, deal_id, status, assigned_at", { count: "exact" })
        .eq("assignee_profile_id", profile.id)
        .eq("status", "active")
        .order("assigned_at", { ascending: false })
        .range(from, to);

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
          .select("id,monday_item_id,ghl_name,deal_name,phone_number,call_center,carrier,policy_type,last_updated")
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
                  phone_number: deal.phone_number ?? null,
                  call_center: deal.call_center ?? null,
                  carrier: deal.carrier ?? null,
                  policy_type: deal.policy_type ?? null,
                  last_updated: deal.last_updated ?? null,
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
  }, [PAGE_SIZE, page]);

  useEffect(() => {
    void loadAssignedLeads();
  }, [loadAssignedLeads]);

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return assignedLeads;
    const q = search.toLowerCase();
    return assignedLeads.filter((row) =>
      ((row.lead?.customer_full_name ?? row.deal?.ghl_name ?? row.deal?.deal_name ?? "").toLowerCase().includes(q)),
    );
  }, [assignedLeads, search]);

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Assigned Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View all leads assigned to you so you can prioritize and choose which lead to contact next.
          </p>
        </div>
      </div>

      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Assigned Leads</CardTitle>
            <CardDescription>
              List view with essential lead data (Name, Status, Last Contact Date).
            </CardDescription>
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
              <div className="grid grid-cols-7 gap-3 p-3 text-sm font-medium text-muted-foreground">
                <div>GHL Name</div>
                <div>Carrier</div>
                <div>Product Type</div>
                <div>Phone</div>
                <div>Center</div>
                <div>Creation Date</div>
                <div className="text-right">Actions</div>
              </div>
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No leads found.</div>
              ) : (
                filteredLeads.map((row) => {
                  const ghlName = row.lead?.customer_full_name ?? row.deal?.ghl_name ?? row.deal?.deal_name ?? "Unknown";
                  const viewHref = `/agent/assigned-lead-details?dealId=${encodeURIComponent(String(row.deal_id ?? ""))}`;

                  return (
                    <div key={row.id} className="grid grid-cols-7 gap-3 p-3 text-sm items-center border-t">
                      <div className="truncate" title={ghlName}>
                        {ghlName}
                      </div>
                      <div className="truncate" title={(row.lead?.carrier ?? row.deal?.carrier) ?? undefined}>
                        {row.lead?.carrier ?? row.deal?.carrier ?? "-"}
                      </div>
                      <div className="truncate" title={(row.lead?.product_type ?? row.deal?.policy_type) ?? undefined}>
                        {row.lead?.product_type ?? row.deal?.policy_type ?? "-"}
                      </div>
                      <div className="truncate" title={(row.lead?.phone_number ?? row.deal?.phone_number) ?? undefined}>
                        {row.lead?.phone_number ?? row.deal?.phone_number ?? "-"}
                      </div>
                      <div className="truncate" title={(row.lead?.lead_vendor ?? row.deal?.call_center) ?? undefined}>
                        {row.lead?.lead_vendor ?? row.deal?.call_center ?? "-"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.lead?.created_at
                          ? new Date(row.lead.created_at).toLocaleDateString()
                          : new Date(row.assigned_at).toLocaleDateString()}
                      </div>
                      <div className="flex flex-col items-end justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => {
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
