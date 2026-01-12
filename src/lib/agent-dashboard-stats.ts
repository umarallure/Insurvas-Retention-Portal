import { supabase } from "@/lib/supabase";
import type { DateRange } from "react-day-picker";
import { getTodayEastern } from "./timezone";

export interface AgentDashboardStats {
  assignedLeads: number;
  completedLeads: number;
  fixedPolicies: number;
  handledPolicies: number;
  pendingLeads: number;
  todayActivity: number;
  thisWeekActivity: number;
  completionRate: number;
  fixSuccessRate: number;
}

export async function getAgentDashboardStats(
  profileId: string,
  range?: DateRange
): Promise<AgentDashboardStats> {
  // Get assigned leads count
  const { count: assignedCount } = await supabase
    .from("retention_assigned_leads")
    .select("*", { count: "exact", head: true })
    .eq("assignee_profile_id", profileId)
    .eq("status", "active");

  // Get completed leads (status = completed)
  const { count: completedCount } = await supabase
    .from("retention_assigned_leads")
    .select("*", { count: "exact", head: true })
    .eq("assignee_profile_id", profileId)
    .eq("status", "completed");

  // Get agent profile name
  const { data: agentProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", profileId)
    .maybeSingle();

  const agentName = agentProfile?.display_name;

  // Get fixed policies count
  let fixedCount = 0;
  if (agentName) {
    const { count } = await supabase
      .from("fixed_policies_tracking")
      .select("*", { count: "exact", head: true })
      .eq("retention_agent_name", agentName);

    fixedCount = count ?? 0;
  }

  // Get handled policies count (policies worked on but not yet fixed)
  let handledCount = 0;
  if (agentName) {
    const { data: handledData } = await supabase
      .from("retention_deal_flow")
      .select("submission_id")
      .eq("retention_agent", agentName);

    const handledSubmissionIds = new Set((handledData ?? []).map((h) => h.submission_id as string));

    // Filter out already fixed policies
    const { data: fixedData } = await supabase
      .from("fixed_policies_tracking")
      .select("submission_id")
      .not("submission_id", "is", null);

    const fixedSubmissionIds = new Set((fixedData ?? []).map((f) => f.submission_id as string));

    handledCount = Array.from(handledSubmissionIds).filter((id) => !fixedSubmissionIds.has(id)).length;
  }

  // Get pending leads (active but not completed)
  const pendingLeads = (assignedCount ?? 0) - (completedCount ?? 0);

  // Get today's activity (calls/updates) - using Eastern Time
  const today = getTodayEastern();
  const { count: todayCount } = await supabase
    .from("call_update_logs")
    .select("*", { count: "exact", head: true })
    .eq("retention_agent_id", profileId)
    .gte("created_at", today.toISOString());

  // Get this week's activity - using Eastern Time
  const weekStart = getTodayEastern();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const { count: weekCount } = await supabase
    .from("call_update_logs")
    .select("*", { count: "exact", head: true })
    .eq("retention_agent_id", profileId)
    .gte("created_at", weekStart.toISOString());

  // Calculate rates
  const totalLeads = (assignedCount ?? 0) + (completedCount ?? 0);
  const completionRate = totalLeads > 0 ? ((completedCount ?? 0) / totalLeads) * 100 : 0;
  const fixSuccessRate = (completedCount ?? 0) > 0 ? ((fixedCount / (completedCount ?? 0)) * 100) : 0;

  return {
    assignedLeads: assignedCount ?? 0,
    completedLeads: completedCount ?? 0,
    fixedPolicies: fixedCount,
    handledPolicies: handledCount,
    pendingLeads: Math.max(0, pendingLeads),
    todayActivity: todayCount ?? 0,
    thisWeekActivity: weekCount ?? 0,
    completionRate: Math.round(completionRate * 10) / 10,
    fixSuccessRate: Math.round(fixSuccessRate * 10) / 10,
  };
}

export interface AgentRecentActivity {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
  policyNumber?: string;
  customerName?: string;
}

export async function getAgentRecentActivity(
  profileId: string,
  limit: number = 10
): Promise<AgentRecentActivity[]> {
  const { data: logs, error } = await supabase
    .from("call_update_logs")
    .select("*")
    .eq("retention_agent_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !logs) return [];

  return logs.map((log) => ({
    id: log.id,
    type: log.event_type ?? "unknown",
    description: log.event_details ? JSON.stringify(log.event_details) : "Activity",
    timestamp: new Date(log.created_at),
    customerName: log.customer_name ?? undefined,
  }));
}

