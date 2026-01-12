/**
 * Executive Dashboard Statistics
 * High-level metrics and recent activity for executive view
 */

import { supabase } from "@/lib/supabase";
import { startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

export type RecentDealActivity = {
  id: number;
  dealName: string;
  policyNumber: string | null;
  carrier: string | null;
  salesAgent: string | null;
  dealValue: number;
  ccValue: number;
  policyStatus: string | null;
  ghlStage: string | null;
  lastUpdated: string;
  status: string | null;
};

export type TopDeal = {
  id: number;
  dealName: string;
  policyNumber: string | null;
  carrier: string | null;
  salesAgent: string | null;
  totalValue: number;
  policyStatus: string | null;
  ghlStage: string | null;
};

export type ExecutiveSummary = {
  recentDeals: RecentDealActivity[];
  topDeals: TopDeal[];
  statusSummary: {
    status: string;
    count: number;
    totalValue: number;
  }[];
};

/**
 * Get recent deal activity for executive dashboard
 */
export async function getRecentDealActivity(
  limit: number = 15,
  range?: DateRange
): Promise<RecentDealActivity[]> {
  try {
    let query = supabase
      .from("monday_com_deals")
      .select("id, deal_name, policy_number, carrier, sales_agent, deal_value, cc_value, policy_status, ghl_stage, last_updated, status")
      .eq("is_active", true)
      .order("last_updated", { ascending: false })
      .limit(limit);

    if (range?.from) {
      query = query.gte("last_updated", startOfDay(range.from).toISOString());
    }
    if (range?.to) {
      query = query.lte("last_updated", endOfDay(range.to).toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data ?? []).map((deal) => ({
      id: deal.id,
      dealName: typeof deal.deal_name === "string" ? deal.deal_name : "Unknown",
      policyNumber: typeof deal.policy_number === "string" ? deal.policy_number : null,
      carrier: typeof deal.carrier === "string" ? deal.carrier : null,
      salesAgent: typeof deal.sales_agent === "string" ? deal.sales_agent : null,
      dealValue: typeof deal.deal_value === "number" ? deal.deal_value : 0,
      ccValue: typeof deal.cc_value === "number" ? deal.cc_value : 0,
      policyStatus: typeof deal.policy_status === "string" ? deal.policy_status : null,
      ghlStage: typeof deal.ghl_stage === "string" ? deal.ghl_stage : null,
      lastUpdated: typeof deal.last_updated === "string" ? deal.last_updated : new Date().toISOString(),
      status: typeof deal.status === "string" ? deal.status : null,
    }));
  } catch (error) {
    console.error("[dashboard-stats-executive] Error fetching recent deals:", error);
    return [];
  }
}

/**
 * Get top deals by value
 */
export async function getTopDeals(
  limit: number = 10,
  range?: DateRange
): Promise<TopDeal[]> {
  try {
    let query = supabase
      .from("monday_com_deals")
      .select("id, deal_name, policy_number, carrier, sales_agent, deal_value, cc_value, policy_status, ghl_stage")
      .eq("is_active", true);

    if (range?.from) {
      query = query.gte("last_updated", startOfDay(range.from).toISOString());
    }
    if (range?.to) {
      query = query.lte("last_updated", endOfDay(range.to).toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    const deals = (data ?? []).map((deal) => ({
      id: deal.id,
      dealName: typeof deal.deal_name === "string" ? deal.deal_name : "Unknown",
      policyNumber: typeof deal.policy_number === "string" ? deal.policy_number : null,
      carrier: typeof deal.carrier === "string" ? deal.carrier : null,
      salesAgent: typeof deal.sales_agent === "string" ? deal.sales_agent : null,
      totalValue: (typeof deal.deal_value === "number" ? deal.deal_value : 0) +
                  (typeof deal.cc_value === "number" ? deal.cc_value : 0),
      policyStatus: typeof deal.policy_status === "string" ? deal.policy_status : null,
      ghlStage: typeof deal.ghl_stage === "string" ? deal.ghl_stage : null,
    }));

    return deals
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, limit);
  } catch (error) {
    console.error("[dashboard-stats-executive] Error fetching top deals:", error);
    return [];
  }
}

/**
 * Get status summary for executive view
 */
export async function getStatusSummary(range?: DateRange): Promise<ExecutiveSummary["statusSummary"]> {
  try {
    let query = supabase
      .from("monday_com_deals")
      .select("policy_status, deal_value, cc_value")
      .eq("is_active", true);

    if (range?.from) {
      query = query.gte("last_updated", startOfDay(range.from).toISOString());
    }
    if (range?.to) {
      query = query.lte("last_updated", endOfDay(range.to).toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    const statusMap = new Map<string, { count: number; totalValue: number }>();

    (data ?? []).forEach((deal) => {
      const status = typeof deal.policy_status === "string" ? deal.policy_status : "Unknown";
      const dealValue = typeof deal.deal_value === "number" ? deal.deal_value : 0;
      const ccValue = typeof deal.cc_value === "number" ? deal.cc_value : 0;
      const totalValue = dealValue + ccValue;

      if (!statusMap.has(status)) {
        statusMap.set(status, { count: 0, totalValue: 0 });
      }

      const stat = statusMap.get(status)!;
      stat.count++;
      stat.totalValue += totalValue;
    });

    return Array.from(statusMap.entries())
      .map(([status, data]) => ({
        status,
        count: data.count,
        totalValue: data.totalValue,
      }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("[dashboard-stats-executive] Error fetching status summary:", error);
    return [];
  }
}


