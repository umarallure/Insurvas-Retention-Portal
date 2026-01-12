/**
 * Dashboard Statistics Utilities
 * Fetches real data from the database for dashboard components
 */

import { supabase } from "@/lib/supabase";
import { eachDayOfInterval, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { getTodayEastern, toEasternMidnight, getNowEasternISO } from "./timezone";

export type DashboardStats = {
  totalActiveDeals: number;
  totalDealValue: number;
  totalCCValue: number;
  totalRetentionSubmissions: number;
  totalFixedPolicies: number;
  todaySubmissions: number;
  todayFixed: number;
  newLeads: number;
  assignedLeads: number;
  unassignedLeads: number;
  handledPolicies: number;
  variation?: {
    deals: number;
    value: number;
    submissions: number;
  };
};

export type ChartDataPoint = {
  date: Date;
  amount: number;
};

export type RecentSale = {
  id: string;
  date: string;
  status: "paid" | "failed" | "pending";
  email: string;
  amount: number;
};

/**
 * Calculate variation percentage between two values
 */
function calculateVariation(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Fetch dashboard statistics
 */
export async function getDashboardStats(
  range?: DateRange,
  previousRange?: DateRange
): Promise<DashboardStats> {
  try {
    // Get today in Eastern Time
    const todayEastern = getTodayEastern();
    const todayStart = todayEastern;
    const todayEnd = new Date(todayEastern);
    todayEnd.setHours(23, 59, 59, 999);

    // Get TOTAL active deals (ALL TIME - no date filter)
    // This represents all active deals regardless of when they were created/updated
    const { count: totalActiveDealsCount, data: allDealsData } = await supabase
      .from("monday_com_deals")
      .select("id, deal_value, cc_value", { count: "exact", head: false })
      .eq("is_active", true)
      .not("monday_item_id", "is", null);

    const totalActiveDeals = totalActiveDealsCount ?? 0;
    const totalDealValue = (allDealsData ?? []).reduce(
      (sum, d) => sum + (typeof d.deal_value === "number" ? d.deal_value : 0),
      0
    );
    const totalCCValue = (allDealsData ?? []).reduce(
      (sum, d) => sum + (typeof d.cc_value === "number" ? d.cc_value : 0),
      0
    );

    // Get NEW LEADS (deals created TODAY only)
    // Use created_at field to identify deals added to the database today
    const { count: newLeadsCount } = await supabase
      .from("monday_com_deals")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("monday_item_id", "is", null)
      .gte("created_at", todayStart.toISOString())
      .lte("created_at", todayEnd.toISOString());

    const newLeads = newLeadsCount ?? 0;

    // Get submissions and fixed policies (with optional date range filter)
    let submissionsQuery = supabase
      .from("retention_deal_flow")
      .select("id, created_at", { count: "exact", head: false });

    let fixedQuery = supabase
      .from("fixed_policies_tracking")
      .select("id, fixed_at", { count: "exact", head: false });

    // Apply date range if provided (convert to Eastern Time)
    if (range?.from) {
      const fromDate = toEasternMidnight(range.from);
      if (fromDate) {
        submissionsQuery = submissionsQuery.gte("created_at", fromDate.toISOString());
        fixedQuery = fixedQuery.gte("fixed_at", fromDate.toISOString());
      }
    }
    if (range?.to) {
      const toDate = toEasternMidnight(range.to);
      if (toDate) {
        const toDateEnd = new Date(toDate);
        toDateEnd.setHours(23, 59, 59, 999);
        submissionsQuery = submissionsQuery.lte("created_at", toDateEnd.toISOString());
        fixedQuery = fixedQuery.lte("fixed_at", toDateEnd.toISOString());
      }
    }

    // Get current period data for submissions and fixed policies
    const [submissionsResult, fixedResult] = await Promise.all([
      submissionsQuery,
      fixedQuery,
    ]);

    const totalRetentionSubmissions = submissionsResult.count ?? 0;
    const totalFixedPolicies = fixedResult.count ?? 0;

    // Get assigned leads count
    const { count: assignedCount } = await supabase
      .from("retention_assigned_leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");
    
    const assignedLeads = assignedCount ?? 0;
    const unassignedLeads = Math.max(0, newLeads - assignedLeads);

    // Get handled policies (policies worked on but not yet fixed)
    const { data: handledData } = await supabase
      .from("retention_deal_flow")
      .select("submission_id")
      .not("retention_agent", "is", null);

    const handledSubmissionIds = new Set((handledData ?? []).map((h) => h.submission_id as string));
    const { data: fixedData } = await supabase
      .from("fixed_policies_tracking")
      .select("submission_id")
      .not("submission_id", "is", null);

    const fixedSubmissionIds = new Set((fixedData ?? []).map((f) => f.submission_id as string));
    const handledPolicies = Array.from(handledSubmissionIds).filter((id) => !fixedSubmissionIds.has(id)).length;

    // Get today's stats
    const [todaySubmissionsResult, todayFixedResult] = await Promise.all([
      supabase
        .from("retention_deal_flow")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString())
        .lte("created_at", todayEnd.toISOString()),
      supabase
        .from("fixed_policies_tracking")
        .select("id", { count: "exact", head: true })
        .gte("fixed_at", todayStart.toISOString())
        .lte("fixed_at", todayEnd.toISOString()),
    ]);

    const todaySubmissions = todaySubmissionsResult.count ?? 0;
    const todayFixed = todayFixedResult.count ?? 0;

    // Calculate variations if previous period is provided
    let variation: DashboardStats["variation"] | undefined;
    if (previousRange) {
      // For variations, compare date-filtered deals in current range vs previous range
      let currentPeriodDealsQuery = supabase
        .from("monday_com_deals")
        .select("id, deal_value", { count: "exact", head: false })
        .eq("is_active", true)
        .not("monday_item_id", "is", null);

      // Apply current range filter if provided
      if (range?.from) {
        const fromDate = toEasternMidnight(range.from);
        if (fromDate) {
          currentPeriodDealsQuery = currentPeriodDealsQuery.gte("last_updated", fromDate.toISOString());
        }
      }
      if (range?.to) {
        const toDate = toEasternMidnight(range.to);
        if (toDate) {
          const toDateEnd = new Date(toDate);
          toDateEnd.setHours(23, 59, 59, 999);
          currentPeriodDealsQuery = currentPeriodDealsQuery.lte("last_updated", toDateEnd.toISOString());
        }
      }

      const [prevDealsResult, prevSubmissionsResult, currentPeriodDealsResult] = await Promise.all([
        supabase
          .from("monday_com_deals")
          .select("id, deal_value", { count: "exact", head: false })
          .eq("is_active", true)
          .not("monday_item_id", "is", null)
          .gte("last_updated", toEasternMidnight(previousRange.from ?? new Date())?.toISOString() ?? "")
          .lte("last_updated", (() => {
            const end = toEasternMidnight(previousRange.to ?? new Date());
            if (end) {
              end.setHours(23, 59, 59, 999);
              return end.toISOString();
            }
            return "";
          })()),
        supabase
          .from("retention_deal_flow")
          .select("id", { count: "exact", head: true })
          .gte("created_at", toEasternMidnight(previousRange.from ?? new Date())?.toISOString() ?? "")
          .lte("created_at", (() => {
            const end = toEasternMidnight(previousRange.to ?? new Date());
            if (end) {
              end.setHours(23, 59, 59, 999);
              return end.toISOString();
            }
            return "";
          })()),
        currentPeriodDealsQuery,
      ]);

      const prevDeals = prevDealsResult.count ?? 0;
      const prevValue = (prevDealsResult.data ?? []).reduce(
        (sum, d) => sum + (typeof d.deal_value === "number" ? d.deal_value : 0),
        0
      );
      const prevSubmissions = prevSubmissionsResult.count ?? 0;
      
      const currentPeriodDeals = currentPeriodDealsResult.count ?? 0;
      const currentPeriodValue = (currentPeriodDealsResult.data ?? []).reduce(
        (sum, d) => sum + (typeof d.deal_value === "number" ? d.deal_value : 0),
        0
      );

      variation = {
        deals: calculateVariation(currentPeriodDeals, prevDeals),
        value: calculateVariation(currentPeriodValue, prevValue),
        submissions: calculateVariation(totalRetentionSubmissions, prevSubmissions),
      };
    }

    return {
      totalActiveDeals,
      totalDealValue,
      totalCCValue,
      totalRetentionSubmissions,
      totalFixedPolicies,
      todaySubmissions,
      todayFixed,
      newLeads,
      assignedLeads,
      unassignedLeads,
      handledPolicies,
      variation,
    };
  } catch (error) {
    console.error("[dashboard-stats] Error fetching stats:", error);
    return {
      totalActiveDeals: 0,
      totalDealValue: 0,
      totalCCValue: 0,
      totalRetentionSubmissions: 0,
      totalFixedPolicies: 0,
      todaySubmissions: 0,
      todayFixed: 0,
      newLeads: 0,
      assignedLeads: 0,
      unassignedLeads: 0,
      handledPolicies: 0,
    };
  }
}

/**
 * Fetch chart data for revenue/deal value over time
 */
export async function getChartData(
  period: "daily" | "weekly" | "monthly",
  range: DateRange
): Promise<ChartDataPoint[]> {
  try {
    if (!range.from || !range.to) return [];

    // Convert to Eastern Time
    const fromDate = toEasternMidnight(range.from);
    const toDate = toEasternMidnight(range.to);
    if (!fromDate || !toDate) return [];
    
    // Set end date to end of day
    const toDateEnd = new Date(toDate);
    toDateEnd.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("monday_com_deals")
      .select("deal_value, last_updated")
      .eq("is_active", true)
      .not("monday_item_id", "is", null)
      .gte("last_updated", fromDate.toISOString())
      .lte("last_updated", toDateEnd.toISOString())
      .order("last_updated", { ascending: true });

    if (error) throw error;

    // Group by date based on period
    const grouped: Record<string, number> = {};

    (data ?? []).forEach((deal) => {
      const date = new Date(deal.last_updated);
      let key: string;

      if (period === "monthly") {
        key = format(date, "yyyy-MM");
      } else if (period === "weekly") {
        // Get week start (Monday)
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        key = format(weekStart, "yyyy-MM-dd");
      } else {
        // daily
        key = format(date, "yyyy-MM-dd");
      }

      const value = typeof deal.deal_value === "number" ? deal.deal_value : 0;
      grouped[key] = (grouped[key] || 0) + value;
    });

    // Convert to array of RecordPoint
    const points: ChartDataPoint[] = Object.entries(grouped)
      .map(([key, amount]) => {
        let date: Date;
        if (period === "monthly") {
          date = new Date(key + "-01");
        } else {
          date = new Date(key);
        }
        return { date, amount };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return points;
  } catch (error) {
    console.error("[dashboard-stats] Error fetching chart data:", error);
    return [];
  }
}

/**
 * Fetch recent sales/submissions for the sales table
 */
export async function getRecentSales(limit: number = 10): Promise<RecentSale[]> {
  try {
    const { data, error } = await supabase
      .from("retention_deal_flow")
      .select("id, created_at, retention_agent, status, monthly_premium, policy_number, insured_name, client_phone_number")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data ?? []).map((row, idx) => {
      const created = new Date(row.created_at ?? new Date());
      const premium = typeof row.monthly_premium === "number" ? row.monthly_premium : 0;
      const status = row.status?.toLowerCase().includes("paid") || row.status?.toLowerCase().includes("success")
        ? "paid"
        : row.status?.toLowerCase().includes("fail") || row.status?.toLowerCase().includes("chargeback")
          ? "failed"
          : "pending";

      // Use policy number or client name/phone as identifier
      const identifier = 
        (typeof row.policy_number === "string" && row.policy_number.trim()) 
          ? row.policy_number.trim()
          : (typeof row.insured_name === "string" && row.insured_name.trim())
            ? row.insured_name.trim()
            : (typeof row.client_phone_number === "string" && row.client_phone_number.trim())
              ? row.client_phone_number.trim()
              : typeof row.retention_agent === "string" 
                ? row.retention_agent 
                : "Unknown";

      return {
        id: String(row.id ?? idx),
        date: created.toISOString(),
        status: status as "paid" | "failed" | "pending",
        email: identifier, // Using identifier instead of email
        amount: premium,
      };
    });
  } catch (error) {
    console.error("[dashboard-stats] Error fetching recent sales:", error);
    return [];
  }
}

