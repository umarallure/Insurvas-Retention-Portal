"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, PhoneForwardedIcon, EyeIcon, ShieldIcon } from "lucide-react";

type AssignedLeadRow = {
  id: string;
  lead_id: string;
  status: string;
  assigned_at: string;
  lead?: {
    customer_full_name: string | null;
    carrier: string | null;
    product_type: string | null;
    phone_number: string | null;
    lead_vendor: string | null;
    created_at: string | null;
  } | null;
};

export default function AssignedLeadsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [assignedLeads, setAssignedLeads] = useState<AssignedLeadRow[]>([]);

  useEffect(() => {
    void loadAssignedLeads();
  }, []);

  const loadAssignedLeads = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setAssignedLeads([]);
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
        return;
      }

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("retention_assigned_leads")
        .select("id, lead_id, status, assigned_at")
        .eq("assignee_profile_id", profile.id)
        .eq("status", "active")
        .order("assigned_at", { ascending: false });

      if (assignmentError) {
        console.error("[agent-assigned-leads] assignments error", assignmentError);
        setAssignedLeads([]);
        return;
      }

      const assignments = (assignmentRows ?? []) as AssignedLeadRow[];

      if (assignments.length === 0) {
        setAssignedLeads([]);
        return;
      }

      const leadIds = assignments.map((a) => a.lead_id);
      const { data: leadRows, error: leadsError } = await supabase
        .from("leads")
        .select("id, customer_full_name, carrier, product_type, phone_number, lead_vendor, created_at")
        .in("id", leadIds);

      if (leadsError) {
        console.error("[agent-assigned-leads] leads error", leadsError);
        setAssignedLeads(assignments);
        return;
      }

      const leadById = new Map<string, AssignedLeadRow["lead"]>();
      (leadRows ?? []).forEach((row) => {
        leadById.set(row.id as string, {
          customer_full_name: (row.customer_full_name as string | null) ?? null,
          carrier: (row.carrier as string | null) ?? null,
          product_type: (row.product_type as string | null) ?? null,
          phone_number: (row.phone_number as string | null) ?? null,
          lead_vendor: (row.lead_vendor as string | null) ?? null,
          created_at: (row.created_at as string | null) ?? null,
        });
      });

      setAssignedLeads(
        assignments.map((a) => ({
          ...a,
          lead: leadById.get(a.lead_id) ?? null,
        })),
      );
    } catch (error) {
      console.error("[agent-assigned-leads] load error", error);
      setAssignedLeads([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return assignedLeads;
    const q = search.toLowerCase();
    return assignedLeads.filter((row) =>
      (row.lead?.customer_full_name ?? "").toLowerCase().includes(q),
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
                onChange={(e) => setSearch(e.target.value)}
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
                <div className="border-t p-3 text-sm text-muted-foreground flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading assigned leads...
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="border-t p-3 text-sm text-muted-foreground">No assigned leads yet.</div>
              ) : (
                filteredLeads.map((row) => {
                  const ghlName = row.lead?.customer_full_name ?? "Unknown";
                  const leadIdForRoutes = row.lead_id;

                  const viewHref = `/agent/assigned-lead-details?id=${encodeURIComponent(String(leadIdForRoutes))}`;
                  const retentionHref = `/retention-flow?id=${encodeURIComponent(String(leadIdForRoutes))}`;

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-7 gap-3 p-3 text-sm items-center border-t bg-background/40"
                    >
                      <div className="truncate" title={ghlName}>
                        {ghlName}
                      </div>
                      <div className="truncate" title={row.lead?.carrier ?? undefined}>
                        {row.lead?.carrier ?? "-"}
                      </div>
                      <div className="truncate" title={row.lead?.product_type ?? undefined}>
                        {row.lead?.product_type ?? "-"}
                      </div>
                      <div className="truncate" title={row.lead?.phone_number ?? undefined}>
                        {row.lead?.phone_number ?? "-"}
                      </div>
                      <div className="truncate" title={row.lead?.lead_vendor ?? undefined}>
                        {row.lead?.lead_vendor ?? "-"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.lead?.created_at
                          ? new Date(row.lead.created_at).toLocaleDateString()
                          : new Date(row.assigned_at).toLocaleDateString()}
                      </div>
                      <div className="flex flex-col items-end justify-center gap-2">
                        <Button
                          size="sm"
                          className="gap-1"
                          onClick={() => {
                            void router.push(
                              `/agent/call-update?leadId=${encodeURIComponent(leadIdForRoutes)}`,
                            );
                          }}
                        >
                          <PhoneForwardedIcon className="size-4" />
                          Claim Call
                        </Button>
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
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-1"
                          onClick={() => {
                            void router.push(retentionHref);
                          }}
                        >
                          <ShieldIcon className="size-4" />
                          Claim Retention
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
