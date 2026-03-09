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
import { getVicidialAgentMappingFromDb } from "@/lib/vicidial-agent-mapping";
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

export default function AgentDialerDashboard() {
  const [queueLeads, setQueueLeads] = useState<QueueLeadRow[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionUpdating, setSessionUpdating] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [vicidialAgentUser, setVicidialAgentUser] = useState<string>(
    () => process.env.NEXT_PUBLIC_VICIDIAL_AGENT_USER ?? ""
  );
  const defaultVicidialCampaignId = process.env.NEXT_PUBLIC_VICIDIAL_CAMPAIGN_ID || "ret1cda9";

  const [vicidialCampaignId, setVicidialCampaignId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return defaultVicidialCampaignId || undefined;
    try {
      const saved = localStorage.getItem("retention_portal_vicidial_campaign");
      if (saved?.trim()) return saved.trim();
    } catch {}
    return defaultVicidialCampaignId || undefined;
  });
  const [vicidialMode, setVicidialMode] = useState<"native" | "wrapper">("native");
  const vicidialBaseUrl =
    process.env.NEXT_PUBLIC_VICIDIAL_AGENT_URL || process.env.NEXT_PUBLIC_VICIDIAL_URL || "";

  // Persist campaign to localStorage so iframe keeps same campaign on reload
  useEffect(() => {
    if (!vicidialCampaignId) return;
    try {
      localStorage.setItem("retention_portal_vicidial_campaign", vicidialCampaignId);
    } catch {}
  }, [vicidialCampaignId]);

  // Build iframe URL with VD_campaign and VD_login so VICIdial login form stays pre-filled on reload
  const vicidialUrl = (() => {
    if (!vicidialBaseUrl) return "";
    try {
      const u = new URL(vicidialBaseUrl);
      if (vicidialCampaignId) u.searchParams.set("VD_campaign", vicidialCampaignId);
      u.searchParams.set("VD_login", vicidialAgentUser);
      return u.toString();
    } catch {
      return vicidialBaseUrl;
    }
  })();
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
    let cancelled = false;
    void (async () => {
      const mapping = await getVicidialAgentMappingFromDb(profileId);
      if (cancelled || !mapping) return;

      if (mapping.campaignId) {
        setVicidialCampaignId(String(mapping.campaignId));
      }
      const mappedUser = mapping.vicidialUser || mapping.phoneLogin || "";
      if (mappedUser) {
        setVicidialAgentUser(mappedUser);
      }
    })();

    return () => {
      cancelled = true;
    };
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
      const result = (await response.json()) as { ok?: boolean; raw?: string; error?: string; message?: string };
      if (!response.ok || result.ok === false) {
        const msg = result.message ?? result.error ?? result.raw ?? "Failed to set agent READY";
        throw new Error(msg);
      }
      setSessionActive(true);
      setVicidialMode("wrapper");
      toast({ title: "Session started", description: "You are now active (READY)." });
    } catch (error) {
      console.error("[dialer] Failed to start session", error);
      toast({
        variant: "destructive",
        title: "Could not go active",
        description: error instanceof Error ? error.message : "Failed to set agent READY",
      });
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
      const result = (await response.json()) as { ok?: boolean; raw?: string; error?: string; message?: string };
      if (!response.ok || result.ok === false) {
        const msg = result.message ?? result.error ?? result.raw ?? "Failed to pause agent";
        throw new Error(msg);
      }
      setSessionActive(false);
      vicidialWrapperRef.current?.notifyExternalHangup();
      toast({ title: "Session paused", description: "You are now paused." });
    } catch (error) {
      console.error("[dialer] Failed to end session", error);
      toast({
        variant: "destructive",
        title: "Could not pause",
        description: error instanceof Error ? error.message : "Failed to pause agent",
      });
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
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0 relative">
          {/* Anchor div: the persistent iframe in _app.tsx positions itself over this element */}
          {vicidialUrl ? (
            <div id="vicidial-iframe-anchor" className="absolute inset-0" />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Missing <code className="mx-1">NEXT_PUBLIC_VICIDIAL_AGENT_URL</code> env var.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
