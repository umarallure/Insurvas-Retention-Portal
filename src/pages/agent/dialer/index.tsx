"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

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

export default function AgentDialerDashboard() {
  const [queueLeads, setQueueLeads] = useState<QueueLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);

  const partnerName = process.env.NEXT_PUBLIC_CLOUDTALK_PARTNER_NAME || "unlimitedinsurance";
  const iframeSrc = `https://phone.cloudtalk.io?partner=${partnerName}`;

  const loadQueue = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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

      const { data: assignments } = await supabase
        .from("retention_assigned_leads")
        .select("id, deal_id, status, assigned_at")
        .eq("assignee_profile_id", profile.id)
        .eq("status", "active")
        .order("assigned_at", { ascending: false });

      if (!assignments?.length) {
        setQueueLeads([]);
        return;
      }

      const dealIds = assignments.map((assignment) => assignment.deal_id).filter((id): id is number => id != null);
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

      const dealMap = new Map(deals?.map((deal) => [deal.id, deal]) ?? []);

      const enriched = assignments.map((assignment) => ({
        ...assignment,
        deal: assignment.deal_id ? dealMap.get(assignment.deal_id) ?? null : null,
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

  const handleStartSession = () => {
    setSessionActive(true);
    setSessionStartTime(new Date());
  };

  const handleEndSession = () => {
    setSessionActive(false);
    setSessionStartTime(null);
  };

  const sessionDuration = useMemo(() => {
    if (!sessionStartTime) return "00:00:00";
    const now = new Date();
    const diff = Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000);
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }, [sessionStartTime]);

  useEffect(() => {
    if (!sessionActive) return;
    const interval = setInterval(() => {
      setSessionStartTime((previous) => (previous ? new Date(previous.getTime()) : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionActive]);

  const openLeadDetails = (dealId: number) => {
    window.open(`/agent/assigned-lead-details?dealId=${dealId}`, "_blank");
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneIcon className="h-4 w-4" />
              Dialer Session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sessionActive ? (
              <Button className="w-full gap-2" size="lg" onClick={handleStartSession}>
                <PlayCircleIcon className="h-5 w-5" />
                Start Dialing Session
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
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    Session Active
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={handleEndSession}>
                  End Session
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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
                              {stageLabel && stageStyle ? (
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
                              ) : null}
                              {disposition ? (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {disposition}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (lead.deal_id) openLeadDetails(lead.deal_id);
                            }}
                          >
                            <ExternalLinkIcon className="h-3.5 w-3.5" />
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

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-3 flex-shrink-0 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PhoneIcon className="h-5 w-5" />
              CloudTalk Dialer
            </CardTitle>
            <Badge variant={sessionActive ? "default" : "secondary"}>
              {sessionActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 relative">
          <iframe
            src={iframeSrc}
            allow="microphone *"
            className="absolute inset-0 w-full h-full border-0"
            title="CloudTalk Dialer"
          />
        </CardContent>
      </Card>
    </div>
  );
}
