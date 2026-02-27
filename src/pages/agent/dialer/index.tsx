"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

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
  Loader2Icon,
} from "lucide-react";
import { getDealLabelStyle, getDealTagLabelFromGhlStage } from "@/lib/monday-deal-category-tags";
import { VicidialWrapper, type VicidialWrapperHandle } from "@/components/vicidial/vicidial-wrapper";
import { getVicidialAgentMapping } from "@/lib/vicidial-agent-mapping";
import { useToast } from "@/hooks/use-toast";

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
  const [sessionUpdating, setSessionUpdating] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const defaultVicidialAgentUser = process.env.NEXT_PUBLIC_VICIDIAL_AGENT_USER || "hussain_khan";
  const defaultVicidialCampaignId = process.env.NEXT_PUBLIC_VICIDIAL_CAMPAIGN_ID || "ret1cda9";
  const [vicidialAgentUser, setVicidialAgentUser] = useState(defaultVicidialAgentUser);
  const [vicidialCampaignId, setVicidialCampaignId] = useState<string | undefined>(
    defaultVicidialCampaignId || undefined,
  );
  const [vicidialMode, setVicidialMode] = useState<"native" | "wrapper">("native");
  const vicidialUrl =
    process.env.NEXT_PUBLIC_VICIDIAL_AGENT_URL || process.env.NEXT_PUBLIC_VICIDIAL_URL || "";
  const { toast } = useToast();
  const vicidialWrapperRef = useRef<VicidialWrapperHandle | null>(null);

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

  useEffect(() => {
    if (!profileId) return;
    const mapping = getVicidialAgentMapping(profileId);
    if (mapping?.vicidialUser) {
      setVicidialAgentUser(mapping.vicidialUser);
    }
    if (mapping?.campaignId) {
      setVicidialCampaignId(mapping.campaignId);
    }
  }, [profileId]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadQueue();
  };

  const handleStartSession = async () => {
    if (!vicidialAgentUser) {
      console.error("[dialer] Missing VICIdial agent user");
      return;
    }
    setSessionUpdating(true);
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
      setVicidialMode("wrapper");
    } catch (error) {
      console.error("[dialer] Failed to start session", error);
    } finally {
      setSessionUpdating(false);
    }
  };

  const handleEndSession = async () => {
    if (!vicidialAgentUser) {
      console.error("[dialer] Missing VICIdial agent user");
      return;
    }
    setSessionUpdating(true);
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
      vicidialWrapperRef.current?.notifyExternalHangup();
    } catch (error) {
      console.error("[dialer] Failed to end session", error);
    } finally {
      setSessionUpdating(false);
    }
  };

  const handleDialLead = async (lead: QueueLeadRow) => {
    if (!vicidialAgentUser) {
      console.error("[dialer] Missing VICIdial agent user");
      toast({
        variant: "destructive",
        title: "Cannot dial",
        description: "Missing VICIdial agent user configuration.",
      });
      return;
    }
    const phone = lead.deal?.phone_number?.trim();
    if (!phone) {
      console.error("[dialer] Selected lead has no phone number");
      toast({
        variant: "destructive",
        title: "Cannot dial",
        description: "Selected lead has no phone number.",
      });
      return;
    }
    setCallingLeadId(lead.id);
    try {
      // Ensure agent is paused before manual dial, per VICIdial expectations.
      await fetch("/api/vicidial/agent-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_user: vicidialAgentUser,
          status: "PAUSE",
          campaign_id: vicidialCampaignId,
        }),
      });

      const response = await fetch("/api/vicidial/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phone,
          agent_user: vicidialAgentUser,
          campaign_id: vicidialCampaignId,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; raw?: string; error?: string };
      if (!response.ok || result.ok === false) {
        throw new Error(result.raw || result.error || "Failed to dial");
      }
      vicidialWrapperRef.current?.notifyExternalDial(phone);
      toast({
        variant: "success",
        title: "Dialing",
        description: `Dial command sent for ${phone}`,
      });
    } catch (error) {
      console.error("[dialer] Failed to dial", error);
      const msg = error instanceof Error ? error.message : "Failed to dial lead.";
      toast({
        variant: "destructive",
        title: "Dial failed",
        description: msg,
      });
    } finally {
      setCallingLeadId(null);
    }
  };

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

  const formatVicidialDate = (value?: string) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  const extractLeadDetailsUrl = (comments?: string) => {
    if (!comments) return null;
    const match = comments.match(/Lead Details:\s*(https?:\/\/\S+)/i);
    return match?.[1] ?? null;
  };

  const getStatusTone = (status?: string) => {
    const s = (status ?? "").toUpperCase();
    if (["SALE", "CLOSER", "CBHOLD", "XFER"].includes(s)) {
      return {
        card: "border-emerald-200 bg-emerald-50/60",
        badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    }
    if (["NEW", "ERI", "CALLBK"].includes(s)) {
      return {
        card: "border-sky-200 bg-sky-50/60",
        badge: "bg-sky-100 text-sky-800 border-sky-200",
      };
    }
    if (["DNC", "DROP", "N", "NA"].includes(s)) {
      return {
        card: "border-rose-200 bg-rose-50/60",
        badge: "bg-rose-100 text-rose-800 border-rose-200",
      };
    }
    return {
      card: "border-amber-200 bg-amber-50/60",
      badge: "bg-amber-100 text-amber-800 border-amber-200",
    };
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Left Panel - Queue & Controls */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
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
              {rightView === "dialer" && (
                <div className="flex rounded-full border bg-muted/40 p-0.5">
                  <Button
                    variant={vicidialMode === "native" ? "default" : "ghost"}
                    size="xs"
                    className="h-7 px-3 text-xs rounded-full"
                    onClick={() => setVicidialMode("native")}
                  >
                    Vicidial Screen
                  </Button>
                  <Button
                    variant={vicidialMode === "wrapper" ? "default" : "ghost"}
                    size="xs"
                    className="h-7 px-3 text-xs rounded-full"
                    onClick={() => setVicidialMode("wrapper")}
                  >
                    Portal Dialer
                  </Button>
                </div>
              )}
              {rightView === "dialer" ? (
                <Button variant="outline" size="sm" onClick={openLeadsView}>
                  View Leads
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setRightView("dialer")}>
                  Back To Dialer
                </Button>
              )}
              <Button
                variant={sessionActive ? "secondary" : "default"}
                size="sm"
                onClick={() => void (sessionActive ? handleEndSession() : handleStartSession())}
                disabled={sessionUpdating || !vicidialAgentUser}
              >
                {sessionUpdating ? (sessionActive ? "Ending..." : "Starting...") : (sessionActive ? "End Session" : "Start Session")}
              </Button>
              <Badge variant={sessionActive ? "default" : "secondary"}>
                {sessionActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0 relative">
          {/* Persistent VICIdial iframe so login/session stay alive between modes */}
          {vicidialUrl ? (
            <iframe
              src={vicidialUrl}
              allow="microphone; autoplay; speaker-selection; camera"
              className={
                vicidialMode === "native"
                  ? "absolute inset-0 w-full h-full border-0"
                  : "absolute inset-0 w-0 h-0 opacity-0 pointer-events-none"
              }
              title="VICIdial Agent"
            />
          ) : null}

          {rightView === "dialer" ? (
            vicidialUrl ? (
              vicidialMode === "native" ? null : (
                <div className="relative h-full flex flex-col">
                  <div className="flex-1 min-h-0">
                    <VicidialWrapper
                      ref={vicidialWrapperRef}
                      agentUser={vicidialAgentUser}
                      campaignId={vicidialCampaignId}
                      sessionActive={sessionActive}
                      sessionUpdating={sessionUpdating}
                      onStartSession={handleStartSession}
                      onEndSession={handleEndSession}
                    />
                  </div>
                </div>
              )
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                Missing <code className="mx-1">NEXT_PUBLIC_VICIDIAL_AGENT_URL</code> env var.
              </div>
            )
          ) : (
            <div className="h-full min-h-0 p-4 flex flex-col gap-3 overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">VICIdial Leads</div>
                <Button variant="ghost" size="sm" onClick={() => void loadVicidialLeads()} disabled={vicidialLeadsLoading}>
                  <RefreshCwIcon className={`h-4 w-4 mr-1 ${vicidialLeadsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              {vicidialLeadsError ? <div className="text-sm text-destructive flex-shrink-0">{vicidialLeadsError}</div> : null}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="space-y-2 pb-2">
                {vicidialLeadsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading leads...</div>
                ) : vicidialLeads.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No leads returned from VICIdial API.</div>
                ) : (
                  vicidialLeads.map((lead, idx) => {
                    const tone = getStatusTone(lead.status);
                    const hasLocation = Boolean(lead.city || lead.state || lead.postal_code);
                    const location = [lead.city, lead.state, lead.postal_code].filter(Boolean).join(" ");
                    return (
                    <div key={`${lead.lead_id ?? "row"}-${idx}`} className={`rounded-lg border p-3 text-sm ${tone.card}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-semibold truncate">
                            {`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "Unknown Lead"}
                          </div>
                          <div className="text-base text-muted-foreground">
                            Lead #{lead.lead_id ?? "-"} {lead.phone_number ? `• ${lead.phone_number}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Badge variant="outline" className={`text-sm ${tone.badge}`}>
                            {lead.status ?? "-"}
                          </Badge>
                          <Badge variant="secondary" className="text-sm bg-white/90 border border-border">
                            List {lead.list_id ?? "-"}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 text-base text-muted-foreground">
                        <div>Vendor: {lead.vendor_lead_code ?? "-"}</div>
                        {hasLocation ? <div>{location}</div> : null}
                        <div>Entry: {formatVicidialDate(lead.entry_date)}</div>
                        <div>Last Call: {formatVicidialDate(lead.last_local_call_time)}</div>
                      </div>

                      {extractLeadDetailsUrl(lead.comments) ? (
                        <div className="mt-2">
                          <a
                            href={extractLeadDetailsUrl(lead.comments) ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-base text-primary hover:underline"
                          >
                            <ExternalLinkIcon className="h-3.5 w-3.5" />
                            Open Lead Details
                          </a>
                        </div>
                      ) : null}

                      {lead.comments ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-base text-muted-foreground">Notes</summary>
                          <div className="mt-1 whitespace-pre-wrap text-base text-muted-foreground">
                            {lead.comments.length > 240 ? `${lead.comments.slice(0, 240)}...` : lead.comments}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  )})
                )}
                </div>
              </div>
              {vicidialRaw ? (
                <details className="text-xs flex-shrink-0">
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
