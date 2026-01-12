/**
 * Extended Dashboard Statistics
 * Additional metrics for Deal Performance, Retention Operations, and Financial dashboards
 */

import { supabase } from "@/lib/supabase";
import { startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

export type CarrierPerformance = {
  carrier: string;
  totalDeals: number;
  totalValue: number;
  averageValue: number;
  conversionRate: number;
  chargebackRate: number;
  issuedPaidCount: number;
  declinedCount: number;
};

export type AgentPerformance = {
  agent: string;
  totalDeals: number;
  totalValue: number;
  averageValue: number;
  conversionRate: number;
  commissionType: {
    advance: number;
    asEarned: number;
    unknown: number;
  };
};

export type CallCenterPerformance = {
  center: string;
  totalDeals: number;
  totalValue: number;
  averageValue: number;
  conversionRate: number;
};

export type RetentionAgentPerformance = {
  agent: string;
  totalSubmissions: number;
  todaySubmissions: number;
  averagePremium: number;
  fixSuccessRate: number;
  statusBreakdown: Record<string, number>;
};

export type StatusBreakdown = {
  status: string;
  count: number;
  percentage: number;
  value: number;
};

export type FinancialMetrics = {
  totalRevenue: number;
  totalCCValue: number;
  averageDealValue: number;
  averageCCValue: number;
  paymentStatus: {
    paid: number;
    notPaid: number;
    chargeback: number;
  };
  commissionStatus: {
    advance: number;
    asEarned: number;
    unknown: number;
  };
  chargebackRate: number;
  collectionRate: number;
};

/**
 * Get carrier performance metrics
 */
export async function getCarrierPerformance(range?: DateRange): Promise<CarrierPerformance[]> {
  try {
    let query = supabase
      .from("monday_com_deals")
      .select("carrier, deal_value, cc_value, policy_status, status")
      .eq("is_active", true);

    if (range?.from) {
      query = query.gte("last_updated", startOfDay(range.from).toISOString());
    }
    if (range?.to) {
      query = query.lte("last_updated", endOfDay(range.to).toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    const carrierMap = new Map<string, CarrierPerformance>();

    (data ?? []).forEach((deal) => {
      const carrier = typeof deal.carrier === "string" ? deal.carrier : "Unknown";
      const dealValue = typeof deal.deal_value === "number" ? deal.deal_value : 0;
      const ccValue = typeof deal.cc_value === "number" ? deal.cc_value : 0;
      const totalValue = dealValue + ccValue;
      const policyStatus = typeof deal.policy_status === "string" ? deal.policy_status : "";
      const status = typeof deal.status === "string" ? deal.status : "";

      if (!carrierMap.has(carrier)) {
        carrierMap.set(carrier, {
          carrier,
          totalDeals: 0,
          totalValue: 0,
          averageValue: 0,
          conversionRate: 0,
          chargebackRate: 0,
          issuedPaidCount: 0,
          declinedCount: 0,
        });
      }

      const perf = carrierMap.get(carrier)!;
      perf.totalDeals++;
      perf.totalValue += totalValue;

      if (policyStatus.toLowerCase().includes("issued paid") || status.toLowerCase().includes("payed")) {
        perf.issuedPaidCount++;
      }
      if (policyStatus.toLowerCase().includes("declined") || status.toLowerCase().includes("decline")) {
        perf.declinedCount++;
      }
      if (status.toLowerCase().includes("charge back") || policyStatus.toLowerCase().includes("charge back")) {
        perf.chargebackRate++;
      }
    });

    const results = Array.from(carrierMap.values()).map((perf) => ({
      ...perf,
      averageValue: perf.totalDeals > 0 ? perf.totalValue / perf.totalDeals : 0,
      conversionRate: perf.totalDeals > 0 ? (perf.issuedPaidCount / perf.totalDeals) * 100 : 0,
      chargebackRate: perf.totalDeals > 0 ? (perf.chargebackRate / perf.totalDeals) * 100 : 0,
    }));

    return results.sort((a, b) => b.totalDeals - a.totalDeals);
  } catch (error) {
    console.error("[dashboard-stats-extended] Error fetching carrier performance:", error);
    return [];
  }
}

/**
 * Get agent performance metrics
 */
export async function getAgentPerformance(range?: DateRange): Promise<AgentPerformance[]> {
  try {
    let query = supabase
      .from("monday_com_deals")
      .select("sales_agent, deal_value, cc_value, policy_status, commission_type")
      .eq("is_active", true);

    if (range?.from) {
      query = query.gte("last_updated", startOfDay(range.from).toISOString());
    }
    if (range?.to) {
      query = query.lte("last_updated", endOfDay(range.to).toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    const agentMap = new Map<string, AgentPerformance>();

    (data ?? []).forEach((deal) => {
      const agent = typeof deal.sales_agent === "string" ? deal.sales_agent : "Unknown";
      const dealValue = typeof deal.deal_value === "number" ? deal.deal_value : 0;
      const ccValue = typeof deal.cc_value === "number" ? deal.cc_value : 0;
      const totalValue = dealValue + ccValue;
      const policyStatus = typeof deal.policy_status === "string" ? deal.policy_status : "";
      const commissionType = typeof deal.commission_type === "string" ? deal.commission_type : "unknown";

      if (!agentMap.has(agent)) {
        agentMap.set(agent, {
          agent,
          totalDeals: 0,
          totalValue: 0,
          averageValue: 0,
          conversionRate: 0,
          commissionType: {
            advance: 0,
            asEarned: 0,
            unknown: 0,
          },
        });
      }

      const perf = agentMap.get(agent)!;
      perf.totalDeals++;
      perf.totalValue += totalValue;

      if (commissionType.toLowerCase().includes("advance")) {
        perf.commissionType.advance++;
      } else if (commissionType.toLowerCase().includes("as-earned") || commissionType.toLowerCase().includes("asearned")) {
        perf.commissionType.asEarned++;
      } else {
        perf.commissionType.unknown++;
      }
    });

    const results = Array.from(agentMap.values()).map((perf) => {
      const issuedPaid = (data ?? []).filter(
        (d) =>
          typeof d.sales_agent === "string" &&
          d.sales_agent === perf.agent &&
          (typeof d.policy_status === "string"
            ? d.policy_status.toLowerCase().includes("issued paid")
            : false)
      ).length;

      return {
        ...perf,
        averageValue: perf.totalDeals > 0 ? perf.totalValue / perf.totalDeals : 0,
        conversionRate: perf.totalDeals > 0 ? (issuedPaid / perf.totalDeals) * 100 : 0,
      };
    });

    return results.sort((a, b) => b.totalDeals - a.totalDeals);
  } catch (error) {
    console.error("[dashboard-stats-extended] Error fetching agent performance:", error);
    return [];
  }
}

/**
 * Get call center performance metrics
 */
export async function getCallCenterPerformance(range?: DateRange): Promise<CallCenterPerformance[]> {
  try {
    let query = supabase
      .from("monday_com_deals")
      .select("call_center, deal_value, cc_value, policy_status")
      .eq("is_active", true);

    if (range?.from) {
      query = query.gte("last_updated", startOfDay(range.from).toISOString());
    }
    if (range?.to) {
      query = query.lte("last_updated", endOfDay(range.to).toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    const centerMap = new Map<string, CallCenterPerformance>();

    (data ?? []).forEach((deal) => {
      const center = typeof deal.call_center === "string" ? deal.call_center : "Unknown";
      const dealValue = typeof deal.deal_value === "number" ? deal.deal_value : 0;
      const ccValue = typeof deal.cc_value === "number" ? deal.cc_value : 0;
      const totalValue = dealValue + ccValue;

      if (!centerMap.has(center)) {
        centerMap.set(center, {
          center,
          totalDeals: 0,
          totalValue: 0,
          averageValue: 0,
          conversionRate: 0,
        });
      }

      const perf = centerMap.get(center)!;
      perf.totalDeals++;
      perf.totalValue += totalValue;
    });

    const results = Array.from(centerMap.values()).map((perf) => {
      const issuedPaid = (data ?? []).filter(
        (d) =>
          typeof d.call_center === "string" &&
          d.call_center === perf.center &&
          (typeof d.policy_status === "string"
            ? d.policy_status.toLowerCase().includes("issued paid")
            : false)
      ).length;

      return {
        ...perf,
        averageValue: perf.totalDeals > 0 ? perf.totalValue / perf.totalDeals : 0,
        conversionRate: perf.totalDeals > 0 ? (issuedPaid / perf.totalDeals) * 100 : 0,
      };
    });

    return results.sort((a, b) => b.totalDeals - a.totalDeals);
  } catch (error) {
    console.error("[dashboard-stats-extended] Error fetching call center performance:", error);
    return [];
  }
}

/**
 * Get retention agent performance metrics
 */
export async function getRetentionAgentPerformance(range?: DateRange): Promise<RetentionAgentPerformance[]> {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    let query = supabase
      .from("retention_deal_flow")
      .select("retention_agent, created_at, status, monthly_premium")
      .not("retention_agent", "is", null);

    if (range?.from) {
      query = query.gte("created_at", startOfDay(range.from).toISOString());
    }
    if (range?.to) {
      query = query.lte("created_at", endOfDay(range.to).toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    const agentMap = new Map<string, RetentionAgentPerformance>();

    (data ?? []).forEach((row) => {
      const agent = typeof row.retention_agent === "string" ? row.retention_agent : "Unknown";
      const premium = typeof row.monthly_premium === "number" ? row.monthly_premium : 0;
      const status = typeof row.status === "string" ? row.status : "Unknown";
      const created = new Date(row.created_at);
      const isToday = created >= todayStart && created <= todayEnd;

      if (!agentMap.has(agent)) {
        agentMap.set(agent, {
          agent,
          totalSubmissions: 0,
          todaySubmissions: 0,
          averagePremium: 0,
          fixSuccessRate: 0,
          statusBreakdown: {},
        });
      }

      const perf = agentMap.get(agent)!;
      perf.totalSubmissions++;
      if (isToday) perf.todaySubmissions++;

      if (!perf.statusBreakdown[status]) {
        perf.statusBreakdown[status] = 0;
      }
      perf.statusBreakdown[status]++;

      // Calculate average premium (will be computed after loop)
      (perf as any).premiumSum = ((perf as any).premiumSum || 0) + premium;
    });

    const results = Array.from(agentMap.values()).map((perf) => {
      const premiumSum = (perf as any).premiumSum || 0;
      const fixedCount = Object.entries(perf.statusBreakdown).filter(([status]) =>
        status.toLowerCase().includes("fixed") || status.toLowerCase().includes("success")
      ).reduce((sum, [, count]) => sum + count, 0);

      return {
        ...perf,
        averagePremium: perf.totalSubmissions > 0 ? premiumSum / perf.totalSubmissions : 0,
        fixSuccessRate: perf.totalSubmissions > 0 ? (fixedCount / perf.totalSubmissions) * 100 : 0,
      };
    });

    return results.sort((a, b) => b.totalSubmissions - a.totalSubmissions);
  } catch (error) {
    console.error("[dashboard-stats-extended] Error fetching retention agent performance:", error);
    return [];
  }
}

/**
 * Get status breakdown
 */
export async function getStatusBreakdown(range?: DateRange): Promise<StatusBreakdown[]> {
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

    const statusMap = new Map<string, { count: number; value: number }>();

    (data ?? []).forEach((deal) => {
      const status = typeof deal.policy_status === "string" ? deal.policy_status : "Unknown";
      const dealValue = typeof deal.deal_value === "number" ? deal.deal_value : 0;
      const ccValue = typeof deal.cc_value === "number" ? deal.cc_value : 0;
      const totalValue = dealValue + ccValue;

      if (!statusMap.has(status)) {
        statusMap.set(status, { count: 0, value: 0 });
      }

      const stat = statusMap.get(status)!;
      stat.count++;
      stat.value += totalValue;
    });

    const total = (data ?? []).length;
    const results = Array.from(statusMap.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      percentage: total > 0 ? (data.count / total) * 100 : 0,
      value: data.value,
    }));

    return results.sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("[dashboard-stats-extended] Error fetching status breakdown:", error);
    return [];
  }
}

/**
 * Get financial metrics
 */
export async function getFinancialMetrics(range?: DateRange): Promise<FinancialMetrics> {
  try {
    let query = supabase
      .from("monday_com_deals")
      .select("deal_value, cc_value, status, commission_type")
      .eq("is_active", true);

    if (range?.from) {
      query = query.gte("last_updated", startOfDay(range.from).toISOString());
    }
    if (range?.to) {
      query = query.lte("last_updated", endOfDay(range.to).toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    let totalRevenue = 0;
    let totalCCValue = 0;
    const paymentStatus = { paid: 0, notPaid: 0, chargeback: 0 };
    const commissionStatus = { advance: 0, asEarned: 0, unknown: 0 };

    (data ?? []).forEach((deal) => {
      const dealValue = typeof deal.deal_value === "number" ? deal.deal_value : 0;
      const ccValue = typeof deal.cc_value === "number" ? deal.cc_value : 0;
      const status = typeof deal.status === "string" ? deal.status.toLowerCase() : "";
      const commissionType = typeof deal.commission_type === "string" ? deal.commission_type.toLowerCase() : "";

      totalRevenue += dealValue;
      totalCCValue += ccValue;

      if (status.includes("payed") || status.includes("paid")) {
        paymentStatus.paid++;
      } else if (status.includes("charge back") || status.includes("chargeback")) {
        paymentStatus.chargeback++;
      } else {
        paymentStatus.notPaid++;
      }

      if (commissionType.includes("advance")) {
        commissionStatus.advance++;
      } else if (commissionType.includes("as-earned") || commissionType.includes("asearned")) {
        commissionStatus.asEarned++;
      } else {
        commissionStatus.unknown++;
      }
    });

    const total = (data ?? []).length;
    const totalValue = totalRevenue + totalCCValue;

    return {
      totalRevenue,
      totalCCValue,
      averageDealValue: total > 0 ? totalRevenue / total : 0,
      averageCCValue: total > 0 ? totalCCValue / total : 0,
      paymentStatus,
      commissionStatus,
      chargebackRate: total > 0 ? (paymentStatus.chargeback / total) * 100 : 0,
      collectionRate: total > 0 ? (paymentStatus.paid / total) * 100 : 0,
    };
  } catch (error) {
    console.error("[dashboard-stats-extended] Error fetching financial metrics:", error);
    return {
      totalRevenue: 0,
      totalCCValue: 0,
      averageDealValue: 0,
      averageCCValue: 0,
      paymentStatus: { paid: 0, notPaid: 0, chargeback: 0 },
      commissionStatus: { advance: 0, asEarned: 0, unknown: 0 },
      chargebackRate: 0,
      collectionRate: 0,
    };
  }
}


