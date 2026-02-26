"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import {
  PhoneIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  UsersIcon,
  PlayCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
} from "lucide-react";
import { getDealLabelStyle, getDealTagLabelFromGhlStage } from "@/lib/monday-deal-category-tags";

type QueueLeadRow = {
  id: string;
  deal_id: number | null;
  status: string;
  assigned_at: string;
  deal?: {
    ghl_name: string | null;
    deal_name: string | null;
    ghl_stage?: string | null;
    phone_number: string | null;
    carrier: string | null;
    disposition: string | null;
  } | null;
};

type VicidialLeadRow = {
  lead_id?: string;
  phone_number?: string;
  alt_phone?: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  email?: string;
  status?: string;
  list_id?: string;
  vendor_lead_code?: string;
  source_id?: string;
  called_count?: string;
  entry_date?: string;
  modify_date?: string;
  last_local_call_time?: string;
  comments?: string;
  raw: string;
};

export default function AgentDialerDashboard() {
  const [queueLeads, setQueueLeads] = useState<QueueLeadRow[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rightView, setRightView] = useState<"dialer" | "vicidial-leads">("dialer");
  const [vicidialLeads, setVicidialLeads] = useState<VicidialLeadRow[]>([]);
  const [vicidialLeadsLoading, setVicidialLeadsLoading] = useState(false);
  const [vicidialLeadsError, setVicidialLeadsError] = useState<string | null>(null);
  const [vicidialRaw, setVicidialRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionUpdating, setSessionUpdating] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [dialerMessage, setDialerMessage] = useState<string | null>(null);
  const [dialerError, setDialerError] = useState<string | null>(null);

  const vicidialUrl = process.env.NEXT_PUBLIC_VICIDIAL_AGENT_URL || process.env.NEXT_PUBLIC_VICIDIAL_URL || "";
  const vicidialAgentUser = process.env.NEXT_PUBLIC_VICIDIAL_AGENT_USER || "";
  const vicidialCampaignId = process.env.NEXT_PUBLIC_VICIDIAL_CAMPAIGN_ID || undefined;

  // Load assigned leads queue
  const loadQueue = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setQueueLeads([]);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (!profile) {
        setQueueLeads([]);
        return;
      }
      setProfileId(profile.id);

      // Get active assigned leads
      const { data: assignments } = await supabase
        .from("retention_assigned_leads")
        .select("id, deal_id, status, assigned_at")
        .eq("assignee_profile_id", profile.id)
        .eq("status", "active")
        .order("assigned_at", { ascending: true })
        .limit(50);

      if (!assignments?.length) {
        setQueueLeads([]);
        return;
      }

      // Get deal details
      const dealIds = assignments.map(a => a.deal_id).filter((id): id is number => id != null);
      if (dealIds.length === 0) {
        setQueueLeads(assignments as QueueLeadRow[]);
        return;
      }

      const { data: deals } = await supabase
        .from("monday_com_deals")
        .select("id, ghl_name, deal_name, ghl_stage, phone_number, carrier, disposition")
        .eq("is_active", true)
        .in("id", dealIds)
        .limit(5000);

      const dealMap = new Map(deals?.map(d => [d.id, d]) ?? []);
      
      const enriched = assignments.map(a => ({
        ...a,
        deal: a.deal_id ? dealMap.get(a.deal_id) ?? null : null,
      })) as QueueLeadRow[];

      setQueueLeads(enriched);
    } catch (error) {
      console.error("[dialer] Error loading queue:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadQueue();
  };

  const handleStartSession = async () => {
    if (!vicidialAgentUser) {
      setDialerError("Missing NEXT_PUBLIC_VICIDIAL_AGENT_USER");
      return;
    }
    setSessionUpdating(true);
    setDialerError(null);
    setDialerMessage(null);
    try {
      const response = await fetch("/api/vicidial/agent-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_user: vicidialAgentUser,
          status: "READY",
          campaign_id: vicidialCampaignId,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; raw?: string };
      if (!response.ok || result.ok === false) {
        throw new Error(result.raw || "Failed to set agent READY");
      }
      setSessionActive(true);
      setSessionStartTime(new Date());
      setDialerMessage("Agent status set to READY");
    } catch (error) {
      setDialerError(error instanceof Error ? error.message : "Failed to start session");
    } finally {
      setSessionUpdating(false);
    }
  };

  const handleEndSession = async () => {
    if (!vicidialAgentUser) {
      setDialerError("Missing NEXT_PUBLIC_VICIDIAL_AGENT_USER");
      return;
    }
    setSessionUpdating(true);
    setDialerError(null);
    setDialerMessage(null);
    try {
      await fetch("/api/vicidial/hangup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_user: vicidialAgentUser,
          campaign_id: vicidialCampaignId,
        }),
      });
      const response = await fetch("/api/vicidial/agent-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_user: vicidialAgentUser,
          status: "PAUSE",
          campaign_id: vicidialCampaignId,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; raw?: string };
      if (!response.ok || result.ok === false) {
        throw new Error(result.raw || "Failed to pause agent");
      }
      setSessionActive(false);
      setSessionStartTime(null);
      setDialerMessage("Agent paused");
    } catch (error) {
      setDialerError(error instanceof Error ? error.message : "Failed to end session");
    } finally {
      setSessionUpdating(false);
    }
  };

  const handleDialLead = async (lead: QueueLeadRow) => {
    if (!vicidialAgentUser) {
      setDialerError("Missing NEXT_PUBLIC_VICIDIAL_AGENT_USER");
      return;
    }
    const phone = lead.deal?.phone_number?.trim();
    if (!phone) {
      setDialerError("Selected lead has no phone number");
      return;
    }
    setCallingLeadId(lead.id);
    setDialerError(null);
    setDialerMessage(null);
    try {
      const response = await fetch("/api/vicidial/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phone,
          agent_user: vicidialAgentUser,
          campaign_id: vicidialCampaignId,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; raw?: string };
      if (!response.ok || result.ok === false) {
        throw new Error(result.raw || "Failed to dial");
      }
      setDialerMessage(`Dial request sent for ${phone}`);
    } catch (error) {
      setDialerError(error instanceof Error ? error.message : "Failed to dial");
    } finally {
      setCallingLeadId(null);
    }
  };

  // Session duration display
  const sessionDuration = useMemo(() => {
    if (!sessionStartTime) return "00:00:00";
    const now = new Date();
    const diff = Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000);
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [sessionStartTime]);

  // Update timer every second when session is active
  useEffect(() => {
    if (!sessionActive) return;
    const interval = setInterval(() => {
      // Force re-render to update duration
      setSessionStartTime(prev => prev ? new Date(prev.getTime()) : null);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionActive]);

  const openLeadDetails = (dealId: number) => {
    // Open in new tab - call stays active in this tab
    window.open(`/agent/assigned-lead-details?dealId=${dealId}`, "_blank");
  };

  const loadVicidialLeads = useCallback(async () => {
    if (!profileId) {
      setVicidialLeadsError("Missing agent profile");
      return;
    }
    setVicidialLeadsLoading(true);
    setVicidialLeadsError(null);
    setVicidialRaw("");
    try {
      const response = await fetch("/api/vicidial/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, limit: 100 }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        leads?: VicidialLeadRow[];
        raw?: string;
        details?: string;
      };
      if (!response.ok || result.ok === false) {
        throw new Error(result.details || "Failed to load VICIdial leads");
      }
      setVicidialLeads(result.leads ?? []);
      setVicidialRaw(result.raw ?? "");
    } catch (error) {
      setVicidialLeadsError(error instanceof Error ? error.message : "Failed to load VICIdial leads");
      setVicidialLeads([]);
    } finally {
      setVicidialLeadsLoading(false);
    }
  }, [profileId]);

  const openLeadsView = () => {
    setRightView("vicidial-leads");
    void loadVicidialLeads();
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Left Panel - Queue & Controls */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        {/* Session Controls */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneIcon className="h-4 w-4" />
              Dialer Session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dialerError ? <div className="text-xs text-destructive">{dialerError}</div> : null}
            {dialerMessage ? <div className="text-xs text-green-600">{dialerMessage}</div> : null}
            {!sessionActive ? (
              <Button 
                className="w-full gap-2" 
                size="lg"
                onClick={handleStartSession}
                disabled={sessionUpdating}
              >
                <PlayCircleIcon className="h-5 w-5" />
                {sessionUpdating ? "Starting..." : "Start Dialing Session"}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ClockIcon className="h-4 w-4" />
                    Session Time
                  </div>
                  <Badge variant="outline" className="font-mono">
                    {sessionDuration}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Session Active
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleEndSession}
                  disabled={sessionUpdating}
                >
                  {sessionUpdating ? "Ending..." : "End Session"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Queue Overview */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersIcon className="h-4 w-4" />
                Lead Queue
                <Badge variant="secondary" className="ml-1">
                  {queueLeads.length}
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCwIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <ScrollArea className="h-full px-4 pb-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : queueLeads.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No leads in queue
                </div>
              ) : (
                <div className="space-y-2">
                  {queueLeads.map((lead) => {
                    const name = lead.deal?.ghl_name || lead.deal?.deal_name || "Unknown";
                    const phone = lead.deal?.phone_number || "No phone";
                    const stage = lead.deal?.ghl_stage;
                    const stageLabel = stage ? getDealTagLabelFromGhlStage(stage) : null;
                    const stageStyle = stageLabel ? getDealLabelStyle(stageLabel) : null;
                    const disposition = lead.deal?.disposition;

                    return (
                      <div
                        key={lead.id}
                        className="group p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => lead.deal_id && openLeadDetails(lead.deal_id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{name}</div>
                            <div className="text-xs text-muted-foreground truncate">{phone}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {stageLabel && stageStyle && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0"
                                  style={{
                                    backgroundColor: stageStyle.bg,
                                    borderColor: stageStyle.border,
                                    color: stageStyle.text,
                                  }}
                                >
                                  {stageLabel}
                                </Badge>
                              )}
                              {disposition && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {disposition}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (lead.deal_id) openLeadDetails(lead.deal_id);
                            }}
                          >
                            <ExternalLinkIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={!lead.deal?.phone_number || callingLeadId === lead.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDialLead(lead);
                            }}
                          >
                            {callingLeadId === lead.id ? "Calling..." : "Call"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Quick Tips */}
        <Card className="flex-shrink-0">
          <CardContent className="pt-4 pb-3">
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2Icon className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                <span>When call connects, open <strong>&quot;Lead Details&quot;</strong> from the queue</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2Icon className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                <span>Details open in new tab - call stays active here</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2Icon className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                <span>Verify info, update disposition, then return to dialer</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - VICIdial (Full Height) */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-3 flex-shrink-0 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PhoneIcon className="h-5 w-5" />
              VICIdial
            </CardTitle>
            <div className="flex items-center gap-2">
              {rightView === "dialer" ? (
                <Button variant="outline" size="sm" onClick={openLeadsView}>
                  View Leads
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setRightView("dialer")}>
                  Back To Dialer
                </Button>
              )}
              <Badge variant={sessionActive ? "default" : "secondary"}>
                {sessionActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 relative">
          {rightView === "dialer" ? (
            vicidialUrl ? (
              <iframe
                src={vicidialUrl}
                allow="microphone *"
                className="absolute inset-0 w-full h-full border-0"
                title="VICIdial Agent"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                Missing <code className="mx-1">NEXT_PUBLIC_VICIDIAL_AGENT_URL</code> env var.
              </div>
            )
          ) : (
            <div className="h-full overflow-auto p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">VICIdial Leads</div>
                <Button variant="ghost" size="sm" onClick={() => void loadVicidialLeads()} disabled={vicidialLeadsLoading}>
                  <RefreshCwIcon className={`h-4 w-4 mr-1 ${vicidialLeadsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              {vicidialLeadsError ? <div className="text-sm text-destructive">{vicidialLeadsError}</div> : null}
              {vicidialLeadsLoading ? (
                <div className="text-sm text-muted-foreground">Loading leads...</div>
              ) : vicidialLeads.length === 0 ? (
                <div className="text-sm text-muted-foreground">No leads returned from VICIdial API.</div>
              ) : (
                <div className="space-y-2">
                  {vicidialLeads.map((lead, idx) => (
                    <div key={`${lead.lead_id ?? "row"}-${idx}`} className="rounded border p-2 text-xs">
                      <div className="font-medium">
                        Lead #{lead.lead_id ?? "-"} {lead.phone_number ? `• ${lead.phone_number}` : ""}{" "}
                        {(lead.first_name || lead.last_name) ? `• ${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() : ""}
                      </div>
                      <div className="text-muted-foreground">
                        Status: {lead.status ?? "-"} • List: {lead.list_id ?? "-"}
                      </div>
                      <div className="text-muted-foreground">
                        Vendor Code: {lead.vendor_lead_code ?? "-"} • Source: {lead.source_id ?? "-"} • Called: {lead.called_count ?? "0"}
                      </div>
                      <div className="text-muted-foreground">
                        {lead.city ?? "-"}, {lead.state ?? "-"} {lead.postal_code ?? ""} • {lead.email ?? "no-email"}
                      </div>
                      <div className="text-muted-foreground">
                        Entry: {lead.entry_date ?? "-"} • Last Call: {lead.last_local_call_time ?? "-"}
                      </div>
                      {lead.comments ? <div className="mt-1 whitespace-pre-wrap">{lead.comments}</div> : null}
                    </div>
                  ))}
                </div>
              )}
              {vicidialRaw ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Raw VICIdial response</summary>
                  <pre className="mt-2 max-h-60 overflow-auto rounded border p-2">{vicidialRaw}</pre>
                </details>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
