"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, RefreshCw } from "lucide-react";
import { getFixedPoliciesWithCurrentStatus } from "@/lib/fixed-policies/tracking";
import { getNextFixedStatus } from "@/lib/fixed-policies/status-transitions";
import { getDraftDateStatus } from "@/lib/fixed-policies/draft-date-status";
import { getAllHandledPolicies } from "@/lib/handled-policies";
import { createFixedPolicyTracking } from "@/lib/fixed-policies/tracking";
import { Badge } from "@/components/ui/badge";
import { formatEasternDate } from "@/lib/timezone";
import { AlertCircle, CheckCircle2, Clock, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FixedPolicyRow = {
  id: string;
  deal_id: number | null;
  submission_id: string;
  retention_agent_name: string;
  fixed_at: string;
  status_when_fixed: string;
  draft_date: string | null;
  notes: string | null;
  disposition: string | null;
  monday_com_deals: {
    id: number;
    policy_number: string | null;
    carrier: string | null;
    ghl_name: string | null;
    deal_name: string | null;
    phone_number: string | null;
    policy_status: string | null;
    ghl_stage: string | null;
    status: string | null;
  } | null;
};

export default function FixedPoliciesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fixedPolicies, setFixedPolicies] = useState<FixedPolicyRow[]>([]);
  const [handledPolicies, setHandledPolicies] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"fixed" | "handled">("handled");
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [attentionFilter, setAttentionFilter] = useState<string>("all"); // "all" | "needs_confirmation" | "future_draft"
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [markingAsFixed, setMarkingAsFixed] = useState<string | null>(null);

  const loadFixedPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFixedPoliciesWithCurrentStatus({
        retentionAgentName: agentFilter !== "all" ? agentFilter : undefined,
        statusWhenFixed: statusFilter !== "all" ? statusFilter : undefined,
        limit: 1000,
      });

      setFixedPolicies((data ?? []) as FixedPolicyRow[]);
    } catch (error) {
      console.error("[fixed-policies] Error loading:", error);
    } finally {
      setLoading(false);
    }
  }, [agentFilter, statusFilter]);

  const loadHandledPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllHandledPolicies({
        agentName: agentFilter !== "all" ? agentFilter : undefined,
      });
      setHandledPolicies(data ?? []);
    } catch (error) {
      console.error("[fixed-policies] Error loading handled policies:", error);
    } finally {
      setLoading(false);
    }
  }, [agentFilter]);

  const handleMarkAsFixed = useCallback(async (policy: any) => {
    setMarkingAsFixed(policy.submission_id);
    try {
      // Get deal_id from monday_com_deals if available
      let dealId: number | null = null;
      if (policy.monday_com_deals?.id) {
        dealId = policy.monday_com_deals.id;
      }

      // Get current status from monday_com_deals or use status from daily_deal_flow
      const statusWhenFixed = 
        policy.monday_com_deals?.policy_status ?? 
        policy.monday_com_deals?.ghl_stage ?? 
        policy.status ?? 
        "Unknown";

      const result = await createFixedPolicyTracking({
        dealId,
        submissionId: policy.submission_id,
        retentionAgentName: policy.retention_agent,
        statusWhenFixed,
        draftDate: policy.draft_date,
        notes: policy.notes,
        disposition: policy.status,
      });

      if (result) {
        toast({
          title: "Success",
          description: "Policy marked as fixed",
        });
        // Reload both lists
        await Promise.all([loadFixedPolicies(), loadHandledPolicies()]);
      } else {
        throw new Error("Failed to mark as fixed");
      }
    } catch (error) {
      console.error("[fixed-policies] Error marking as fixed:", error);
      toast({
        title: "Error",
        description: "Failed to mark policy as fixed",
        variant: "destructive",
      });
    } finally {
      setMarkingAsFixed(null);
    }
  }, [loadFixedPolicies, loadHandledPolicies, toast]);

  const loadFilterOptions = useCallback(async () => {
    try {
      // Load unique agents from both fixed_policies_tracking and retention_deal_flow
      const [fixedAgentsResult, handledAgentsResult] = await Promise.all([
        supabase
        .from("fixed_policies_tracking")
        .select("retention_agent_name")
          .not("retention_agent_name", "is", null),
        supabase
          .from("retention_deal_flow")
          .select("retention_agent")
          .not("retention_agent", "is", null)
      ]);

      const fixedAgents = (fixedAgentsResult.data ?? [])
            .map((a) => (typeof a.retention_agent_name === "string" ? a.retention_agent_name.trim() : null))
        .filter((a): a is string => a != null && a.length > 0);

      const handledAgents = (handledAgentsResult.data ?? [])
        .map((a) => (typeof a.retention_agent === "string" ? a.retention_agent.trim() : null))
        .filter((a): a is string => a != null && a.length > 0);

      // Combine and deduplicate
      const allAgents = Array.from(new Set([...fixedAgents, ...handledAgents])).sort();
      setAvailableAgents(allAgents);

      // Load unique statuses from fixed_policies_tracking
      const { data: statusData } = await supabase
        .from("fixed_policies_tracking")
        .select("status_when_fixed")
        .not("status_when_fixed", "is", null);

      const statuses = Array.from(
        new Set(
          (statusData ?? [])
            .map((s) => (typeof s.status_when_fixed === "string" ? s.status_when_fixed.trim() : null))
            .filter((s): s is string => s != null && s.length > 0)
        )
      ).sort();

      setAvailableStatuses(statuses);
    } catch (error) {
      console.error("[fixed-policies] Error loading filter options:", error);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "fixed") {
      void loadFixedPolicies();
    } else {
      void loadHandledPolicies();
    }
    void loadFilterOptions();

    // Auto-refresh every 5 minutes to update draft status calculations
    const interval = setInterval(() => {
      if (viewMode === "fixed") {
        void loadFixedPolicies();
      } else {
        void loadHandledPolicies();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [loadFixedPolicies, loadHandledPolicies, loadFilterOptions, viewMode]);

  const filteredPolicies = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    
    if (viewMode === "handled") {
      // Agent filter is already applied server-side in loadHandledPolicies
      // Only apply search filter client-side
      return handledPolicies.filter((policy) => {
        if (!searchLower) return true;
        
        return (
          (policy.monday_com_deals?.policy_number ?? "").toLowerCase().includes(searchLower) ||
          (policy.monday_com_deals?.ghl_name ?? "").toLowerCase().includes(searchLower) ||
          (policy.monday_com_deals?.deal_name ?? "").toLowerCase().includes(searchLower) ||
          (policy.monday_com_deals?.phone_number ?? "").toLowerCase().includes(searchLower) ||
          (policy.retention_agent ?? "").toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Fixed view filtering
    return fixedPolicies.filter((policy) => {
      // Apply search filter
      const matchesSearch =
        !searchLower ||
        (policy.monday_com_deals?.policy_number ?? "").toLowerCase().includes(searchLower) ||
        (policy.monday_com_deals?.ghl_name ?? "").toLowerCase().includes(searchLower) ||
        (policy.monday_com_deals?.deal_name ?? "").toLowerCase().includes(searchLower) ||
        (policy.monday_com_deals?.phone_number ?? "").toLowerCase().includes(searchLower) ||
        (policy.retention_agent_name ?? "").toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Apply agent filter
      if (agentFilter !== "all") {
        if ((policy.retention_agent_name ?? "").trim() !== agentFilter.trim()) {
          return false;
        }
      }

      // Apply status filter
      if (statusFilter !== "all") {
        if ((policy.status_when_fixed ?? "").trim() !== statusFilter.trim()) {
          return false;
        }
      }

      // Apply attention filter
      if (attentionFilter === "needs_confirmation") {
        const draftStatus = getDraftDateStatus(policy.draft_date, policy.status_when_fixed);
        if (!draftStatus.needsConfirmation) return false;
      } else if (attentionFilter === "future_draft") {
        const draftStatus = getDraftDateStatus(policy.draft_date, policy.status_when_fixed);
        if (!draftStatus.isFuture) return false;
      }

      return true;
    });
  }, [fixedPolicies, handledPolicies, search, agentFilter, statusFilter, attentionFilter, viewMode]);

  // Calculate summary statistics for fixed policies
  const summaryStats = useMemo(() => {
    const stats = {
      total: fixedPolicies.length,
      needsConfirmation: 0,
      futureDraft: 0,
      pastDraft: 0,
      avgBusinessDaysPast: 0,
      maxBusinessDaysPast: 0,
      confirmationBreakdown: {
        days2to3: 0,
        days4to5: 0,
        days6plus: 0,
      },
    };

    const confirmationBusinessDays: number[] = [];

    fixedPolicies.forEach((policy) => {
      const draftStatus = getDraftDateStatus(policy.draft_date, policy.status_when_fixed);
      if (draftStatus.needsConfirmation) {
        stats.needsConfirmation++;
        confirmationBusinessDays.push(draftStatus.businessDaysSince);
        // Breakdown by business days ranges
        if (draftStatus.businessDaysSince >= 2 && draftStatus.businessDaysSince <= 3) {
          stats.confirmationBreakdown.days2to3++;
        } else if (draftStatus.businessDaysSince >= 4 && draftStatus.businessDaysSince <= 5) {
          stats.confirmationBreakdown.days4to5++;
        } else if (draftStatus.businessDaysSince >= 6) {
          stats.confirmationBreakdown.days6plus++;
        }
      }
      if (draftStatus.isFuture) stats.futureDraft++;
      if (!draftStatus.isFuture && policy.draft_date) {
        stats.pastDraft++;
        if (draftStatus.businessDaysSince > stats.maxBusinessDaysPast) {
          stats.maxBusinessDaysPast = draftStatus.businessDaysSince;
        }
      }
    });

    // Calculate average business days for policies needing confirmation
    if (confirmationBusinessDays.length > 0) {
      stats.avgBusinessDaysPast = Math.round(
        (confirmationBusinessDays.reduce((sum, days) => sum + days, 0) / confirmationBusinessDays.length) * 10
      ) / 10;
    }

    return stats;
  }, [fixedPolicies]);

  // Calculate summary statistics for handled policies
  const handledStats = useMemo(() => {
    const stats = {
      total: handledPolicies.length,
      needsConfirmation: 0,
      uniqueAgents: 0,
    };

    const uniqueAgentsSet = new Set<string>();

    handledPolicies.forEach((policy) => {
      // Count unique agents
      if (policy.retention_agent) {
        uniqueAgentsSet.add(policy.retention_agent.trim());
      }

      // Check if needs confirmation (2+ business days past draft date)
      // For handled policies, we use the status field to determine if 3-day rule applies
      const draftStatus = getDraftDateStatus(policy.draft_date, policy.status);
      if (draftStatus.needsConfirmation) {
        stats.needsConfirmation++;
      }
    });

    stats.uniqueAgents = uniqueAgentsSet.size;

    return stats;
  }, [handledPolicies]);


  const getCurrentStatus = (policy: FixedPolicyRow): string => {
    return (
      policy.monday_com_deals?.policy_status ??
      policy.monday_com_deals?.ghl_stage ??
      policy.monday_com_deals?.status ??
      "—"
    );
  };

  const getNextStatus = (policy: FixedPolicyRow): string => {
    const nextStatus = getNextFixedStatus(policy.status_when_fixed);
    return nextStatus ?? "—";
  };

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fixed Policies Tracking</CardTitle>
              <CardDescription>
                {viewMode === "handled" 
                  ? "Policies handled by agents - Mark as fixed when ready"
                  : "Track policies marked as 'Fixed' and monitor their progress"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border p-1">
                <Button
                  variant={viewMode === "handled" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("handled")}
                >
                  Handled ({handledPolicies.length})
                </Button>
                <Button
                  variant={viewMode === "fixed" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("fixed")}
                >
                  Fixed ({fixedPolicies.length})
                </Button>
              </div>
              <Button 
                onClick={() => {
                  if (viewMode === "fixed") {
                    void loadFixedPolicies();
                  } else {
                    void loadHandledPolicies();
                  }
                }} 
                disabled={loading} 
                variant="outline"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-4">
              <Input
                placeholder="Search by policy #, name, phone, or agent..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[300px]"
              />
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {availableAgents.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {agent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {viewMode === "fixed" && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {availableStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}
              {viewMode === "fixed" && (
              <Select value={attentionFilter} onValueChange={setAttentionFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Policies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Policies</SelectItem>
                  <SelectItem value="needs_confirmation">
                    ⚠️ Needs Confirmation ({summaryStats.needsConfirmation})
                  </SelectItem>
                  <SelectItem value="future_draft">
                    📅 Future Draft ({summaryStats.futureDraft})
                  </SelectItem>
                </SelectContent>
              </Select>
              )}
            </div>

            {/* Summary Cards for Handled View */}
            {viewMode === "handled" && handledPolicies.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Total Handled</div>
                    <div className="text-2xl font-bold">{handledStats.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Policies handled by agents
                    </div>
                  </CardContent>
                </Card>
                <Card className={handledStats.needsConfirmation > 0 ? "border-destructive" : ""}>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Needs Confirmation
                    </div>
                    <div className={`text-2xl font-bold ${handledStats.needsConfirmation > 0 ? "text-destructive" : ""}`}>
                      {handledStats.needsConfirmation}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Past 2+ business days from draft
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Active Agents
                    </div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {handledStats.uniqueAgents}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Agents with handled policies
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Summary Cards for Fixed View */}
            {viewMode === "fixed" && fixedPolicies.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Total Fixed</div>
                    <div className="text-2xl font-bold">{summaryStats.total}</div>
                  </CardContent>
                </Card>
                <Card className={summaryStats.needsConfirmation > 0 ? "border-destructive" : ""}>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Needs Confirmation
                    </div>
                    <div className={`text-2xl font-bold ${summaryStats.needsConfirmation > 0 ? "text-destructive" : ""}`}>
                      {summaryStats.needsConfirmation}
                    </div>
                    {summaryStats.needsConfirmation > 0 ? (
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <div>Avg: {summaryStats.avgBusinessDaysPast} business days</div>
                        {Object.values(summaryStats.confirmationBreakdown).some(count => count > 0) && (
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs mt-0.5">
                            {summaryStats.confirmationBreakdown.days2to3 > 0 && (
                              <span className="whitespace-nowrap">2-3 days: {summaryStats.confirmationBreakdown.days2to3}</span>
                            )}
                            {summaryStats.confirmationBreakdown.days4to5 > 0 && (
                              <span className="whitespace-nowrap">4-5 days: {summaryStats.confirmationBreakdown.days4to5}</span>
                            )}
                            {summaryStats.confirmationBreakdown.days6plus > 0 && (
                              <span className="whitespace-nowrap">6+ days: {summaryStats.confirmationBreakdown.days6plus}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                    <div className="text-xs text-muted-foreground mt-1">
                      Past 2+ business days
                    </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Future Draft
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {summaryStats.futureDraft}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Draft date upcoming
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Past Draft</div>
                    <div className="text-2xl font-bold">{summaryStats.pastDraft}</div>
                    {summaryStats.pastDraft > 0 && summaryStats.maxBusinessDaysPast > 0 ? (
                      <div className="text-xs text-muted-foreground mt-1">
                        Max: {summaryStats.maxBusinessDaysPast} business days past
                      </div>
                    ) : (
                    <div className="text-xs text-muted-foreground mt-1">
                      Draft date passed
                    </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy #</TableHead>
                    <TableHead>Insured Name</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>RA Name</TableHead>
                    {viewMode === "fixed" ? (
                      <>
                        <TableHead>Status When Fixed</TableHead>
                        <TableHead>Current Status</TableHead>
                        <TableHead>Next Fixed Status</TableHead>
                        <TableHead>Draft Date</TableHead>
                        <TableHead>Draft Status</TableHead>
                        <TableHead>Fixed Date</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Status</TableHead>
                        <TableHead>Draft Date</TableHead>
                        <TableHead>Handled Date</TableHead>
                        <TableHead>Action</TableHead>
                      </>
                    )}
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewMode === "handled" ? (
                    <>
                      {loading && handledPolicies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : handledPolicies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No handled policies found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPolicies
                        .map((policy) => (
                          <TableRow key={policy.submission_id}>
                            <TableCell className="font-mono text-sm">
                              {policy.monday_com_deals?.policy_number ?? policy.policy_number ?? "—"}
                            </TableCell>
                            <TableCell>
                              {policy.monday_com_deals?.ghl_name ?? policy.monday_com_deals?.deal_name ?? "—"}
                            </TableCell>
                            <TableCell>{policy.monday_com_deals?.carrier ?? policy.carrier ?? "—"}</TableCell>
                            <TableCell>{policy.retention_agent ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{policy.status ?? "—"}</Badge>
                            </TableCell>
                            <TableCell>
                              {formatEasternDate(policy.draft_date)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatEasternDate(policy.updated_at)}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                onClick={() => void handleMarkAsFixed(policy)}
                                disabled={markingAsFixed === policy.submission_id}
                              >
                                {markingAsFixed === policy.submission_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="h-4 w-4 mr-1" />
                                    Mark as Fixed
                                  </>
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="max-w-xs truncate" title={policy.notes ?? ""}>
                              {policy.notes ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </>
                  ) : (
                    <>
                      {loading && fixedPolicies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredPolicies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No fixed policies found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPolicies.map((policy) => {
                        const draftStatus = getDraftDateStatus(policy.draft_date, policy.status_when_fixed);
                        const currentStatus = getCurrentStatus(policy);
                        const nextStatus = getNextStatus(policy);
                        const needsAttention = draftStatus.needsConfirmation;

                        return (
                          <TableRow 
                            key={policy.id}
                            className={needsAttention ? "bg-destructive/5 border-l-4 border-l-destructive" : ""}
                          >
                            <TableCell className="font-mono text-sm">
                              {policy.monday_com_deals?.policy_number ?? "—"}
                            </TableCell>
                            <TableCell>
                              {policy.monday_com_deals?.ghl_name ?? policy.monday_com_deals?.deal_name ?? "—"}
                            </TableCell>
                            <TableCell>{policy.monday_com_deals?.carrier ?? "—"}</TableCell>
                            <TableCell>{policy.retention_agent_name}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{policy.status_when_fixed}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{currentStatus}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={nextStatus !== "—" ? "default" : "secondary"}>{nextStatus}</Badge>
                            </TableCell>
                            <TableCell>
                              {policy.draft_date ? (
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium">{formatEasternDate(policy.draft_date)}</span>
                                  {draftStatus.isFuture && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      Future date
                                    </span>
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                              <TableCell>
                                {policy.draft_date ? (
                                  <div className="flex flex-col gap-1">
                                    <Badge 
                                      variant={
                                        draftStatus.statusVariant === "warning" 
                                          ? "default" 
                                          : draftStatus.statusVariant === "success"
                                          ? "default"
                                          : draftStatus.statusVariant === "destructive"
                                          ? "destructive"
                                          : draftStatus.statusVariant === "secondary"
                                          ? "secondary"
                                          : "default"
                                      }
                                      className="w-fit"
                                    >
                                      {draftStatus.statusMessage}
                                    </Badge>
                                  {draftStatus.confirmationMessage && (
                                    <div className="text-xs text-destructive font-medium flex items-center gap-1 mt-1">
                                      <AlertCircle className="h-3 w-3" />
                                      {draftStatus.confirmationMessage}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="secondary">No draft date</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatEasternDate(policy.fixed_at)}
                            </TableCell>
                            <TableCell className="max-w-xs truncate" title={policy.notes ?? ""}>
                              {policy.notes ?? "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                      )}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Summary */}
            {filteredPolicies.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {viewMode === "handled" ? (
                  <>Showing {filteredPolicies.length} handled polic{filteredPolicies.length !== 1 ? "ies" : "y"}</>
                ) : (
                  <>Showing {filteredPolicies.length} of {fixedPolicies.length} fixed polic{filteredPolicies.length !== 1 ? "ies" : "y"}</>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

