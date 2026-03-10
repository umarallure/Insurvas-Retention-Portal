"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import {
  PhoneIcon,
  RefreshCwIcon,
  UsersIcon,
  Loader2Icon,
} from "lucide-react";
import { type VicidialWrapperHandle } from "@/components/vicidial/vicidial-wrapper";
import { getVicidialAgentMappingFromDb } from "@/lib/vicidial-agent-mapping";
import { useToast } from "@/hooks/use-toast";

type QueueLeadRow = {
  lead_id: string;
  hopper_order: string;
  priority: string;
  list_id: string;
  phone_number: string;
  status: string;
  last_call_time: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
};

type HopperApiResponse =
  | {
      ok: true;
      rows: QueueLeadRow[];
      raw: string;
      active_lead_id: string | null;
    }
  | {
      ok: false;
      error: string;
      details?: unknown;
      raw?: string;
      active_lead_id: string | null;
    };

function toNumberOrNull(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function orderQueueLeads(rows: QueueLeadRow[], activeLeadId: string | null, callingLeadId: string | null) {
  return [...rows].sort((a, b) => {
    const aLive = activeLeadId && a.lead_id === activeLeadId ? 1 : 0;
    const bLive = activeLeadId && b.lead_id === activeLeadId ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;

    const aCalling = callingLeadId && a.lead_id === callingLeadId ? 1 : 0;
    const bCalling = callingLeadId && b.lead_id === callingLeadId ? 1 : 0;
    if (aCalling !== bCalling) return bCalling - aCalling;

    const aPriority = toNumberOrNull(a.priority) ?? -1;
    const bPriority = toNumberOrNull(b.priority) ?? -1;
    if (aPriority !== bPriority) return bPriority - aPriority;

    const aOrder = toNumberOrNull(a.hopper_order) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = toNumberOrNull(b.hopper_order) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return a.lead_id.localeCompare(b.lead_id);
  });
}

function playRingPing() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    void osc.onended;
    setTimeout(() => {
      void ctx.close();
    }, 250);
  } catch {
    // Ignore audio failures (autoplay restrictions, unsupported browser, etc.)
  }
}

export default function AgentDialerDashboard() {
  const [queueLeads, setQueueLeads] = useState<QueueLeadRow[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionUpdating, setSessionUpdating] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
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
  const lastActiveLeadIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (cancelled) return;
      setProfileId(profile?.id ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load dial queue from VICIdial hopper API (not Supabase assignments).
  const loadQueue = useCallback(async (opts?: { showErrorToast?: boolean }) => {
    try {
      if (!vicidialCampaignId) {
        setQueueLeads([]);
        setActiveLeadId(null);
        return;
      }

      const response = await fetch("/api/vicidial/hopper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: vicidialCampaignId,
          agent_user: vicidialAgentUser || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as HopperApiResponse | null;
      if (!response.ok || !payload || payload.ok === false) {
        const reason =
          payload && "error" in payload ? payload.error : `HTTP ${response.status}`;
        throw new Error(reason || "Failed to load VICIdial hopper");
      }

      const liveLeadId = payload.active_lead_id ? String(payload.active_lead_id).trim() : "";
      const normalized = (payload.rows ?? []).filter((row) => row.lead_id && row.lead_id.trim().length > 0);
      setActiveLeadId(liveLeadId || null);
      setQueueLeads(normalized);
    } catch (error) {
      console.error("[dialer] Error loading queue:", error);
      if (opts?.showErrorToast) {
        toast({
          variant: "destructive",
          title: "Queue refresh failed",
          description: error instanceof Error ? error.message : "Could not load VICIdial hopper.",
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, vicidialAgentUser, vicidialCampaignId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!vicidialCampaignId) return;
    const timer = window.setInterval(() => {
      void loadQueue();
    }, 10000);
    return () => {
      window.clearInterval(timer);
    };
  }, [loadQueue, vicidialCampaignId]);

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
    void loadQueue({ showErrorToast: true });
  };

  const visibleQueueLeads = useMemo(
    () => orderQueueLeads(queueLeads, activeLeadId, callingLeadId),
    [activeLeadId, callingLeadId, queueLeads],
  );

  useEffect(() => {
    if (!activeLeadId) return;
    if (lastActiveLeadIdRef.current === activeLeadId) return;
    lastActiveLeadIdRef.current = activeLeadId;
    playRingPing();
  }, [activeLeadId]);

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
    const phone = lead.phone_number?.trim();
    if (!phone) {
      console.error("[dialer] Selected lead has no phone number");
      toast({
        variant: "destructive",
        title: "Cannot dial",
        description: "Selected lead has no phone number.",
      });
      return;
    }
    setCallingLeadId(lead.lead_id);
    setActiveLeadId(lead.lead_id);
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
      void loadQueue();
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
                  {visibleQueueLeads.length}
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
              ) : visibleQueueLeads.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No leads in queue
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleQueueLeads.map((lead) => {
                    const fullName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
                    const name = fullName || (lead.display_name ?? "").trim() || "Unknown";
                    const phone = lead.phone_number || "No phone";
                    const isLive = activeLeadId != null && lead.lead_id === activeLeadId;
                    const isDialing = callingLeadId != null && lead.lead_id === callingLeadId;
                    const isRinging = isLive || isDialing;
                    const effectiveStatus = isDialing ? "CALLING" : isLive ? "INCALL" : (lead.status || "").toUpperCase();

                    return (
                      <div
                        key={lead.lead_id}
                        className={`p-3 rounded-lg border bg-card transition-colors ${
                          isRinging
                            ? "border-emerald-500 ring-2 ring-emerald-400/40 shadow-[0_0_0_2px_rgba(16,185,129,0.15)] bg-emerald-50/40"
                            : "hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{name}</div>
                            <div className="text-xs text-muted-foreground truncate">{phone}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {isRinging ? (
                                <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-600">
                                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                  {isDialing ? "Ringing" : "Live"}
                                </Badge>
                              ) : null}
                              {effectiveStatus ? (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase">
                                  {effectiveStatus}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={!lead.phone_number || callingLeadId === lead.lead_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDialLead(lead);
                            }}
                          >
                            {callingLeadId === lead.lead_id ? "Calling..." : "Call"}
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
