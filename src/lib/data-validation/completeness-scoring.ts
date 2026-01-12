/**
 * Data Completeness Scoring
 * Calculates completeness percentage for records
 */

import { supabase } from "@/lib/supabase";

export type CompletenessScore = {
  required: number; // 0-100
  optional: number; // 0-100
  overall: number; // 0-100
  missingRequired: string[];
  missingOptional: string[];
  recommendations: string[];
};

export type DealCompleteness = {
  dealId: number;
  submissionId: string;
  score: CompletenessScore;
  breakdown: {
    mondayDeals: number;
    leads: number;
    dealFlow: number;
  };
};

/**
 * Calculate completeness score for a deal
 */
export async function calculateDealCompleteness(
  dealId: number
): Promise<DealCompleteness | null> {
  try {
    // Fetch deal and related data
    const [dealData, leadData, dealFlowData] = await Promise.all([
      supabase.from("monday_com_deals").select("*").eq("id", dealId).maybeSingle(),
      supabase
        .from("leads")
        .select("*")
        .eq("submission_id", dealData.data?.monday_item_id ?? "")
        .maybeSingle(),
      supabase
        .from("daily_deal_flow")
        .select("*")
        .eq("submission_id", dealData.data?.monday_item_id ?? "")
        .maybeSingle(),
    ]);

    const deal = dealData.data;
    const lead = leadData.data;
    const dealFlow = dealFlowData.data;

    if (!deal) {
      return null;
    }

    const submissionId = deal.monday_item_id ?? "";

    // Required fields for monday_com_deals
    const dealRequired = [
      { field: "policy_number", value: deal.policy_number },
      { field: "carrier", value: deal.carrier },
      { field: "sales_agent", value: deal.sales_agent },
      { field: "deal_value", value: deal.deal_value },
      { field: "ghl_stage", value: deal.ghl_stage },
      { field: "policy_status", value: deal.policy_status },
    ];

    // Optional fields for monday_com_deals
    const dealOptional = [
      { field: "notes", value: deal.notes },
      { field: "disposition", value: deal.disposition },
      { field: "disposition_date", value: deal.disposition_date },
      { field: "effective_date", value: deal.effective_date },
      { field: "call_center", value: deal.call_center },
    ];

    // Required fields for leads
    const leadRequired = [
      { field: "customer_full_name", value: lead?.customer_full_name },
      { field: "phone_number", value: lead?.phone_number },
      { field: "submission_id", value: lead?.submission_id },
    ];

    // Optional fields for leads
    const leadOptional = [
      { field: "email", value: lead?.email },
      { field: "street_address", value: lead?.street_address },
      { field: "city", value: lead?.city },
      { field: "state", value: lead?.state },
      { field: "zip_code", value: lead?.zip_code },
      { field: "date_of_birth", value: lead?.date_of_birth },
      { field: "monthly_premium", value: lead?.monthly_premium },
      { field: "coverage_amount", value: lead?.coverage_amount },
    ];

    // Required fields for daily_deal_flow
    const dealFlowRequired = [
      { field: "status", value: dealFlow?.status },
      { field: "submission_id", value: dealFlow?.submission_id },
    ];

    // Optional fields for daily_deal_flow
    const dealFlowOptional = [
      { field: "retention_agent", value: dealFlow?.retention_agent },
      { field: "notes", value: dealFlow?.notes },
      { field: "draft_date", value: dealFlow?.draft_date },
      { field: "monthly_premium", value: dealFlow?.monthly_premium },
      { field: "policy_number", value: dealFlow?.policy_number },
    ];

    // Combine all fields
    const allRequired = [...dealRequired, ...leadRequired, ...dealFlowRequired];
    const allOptional = [...dealOptional, ...leadOptional, ...dealFlowOptional];

    // Calculate completeness
    const requiredPresent = allRequired.filter((f) => {
      if (f.value == null) return false;
      if (typeof f.value === "string" && f.value.trim() === "") return false;
      if (typeof f.value === "number" && f.value === 0 && f.field !== "deal_value") return false;
      return true;
    }).length;

    const optionalPresent = allOptional.filter((f) => {
      if (f.value == null) return false;
      if (typeof f.value === "string" && f.value.trim() === "") return false;
      return true;
    }).length;

    const requiredScore = Math.round((requiredPresent / allRequired.length) * 100);
    const optionalScore = Math.round((optionalPresent / allOptional.length) * 100);
    const overallScore = Math.round(
      ((requiredPresent + optionalPresent) / (allRequired.length + allOptional.length)) * 100
    );

    // Find missing fields
    const missingRequired = allRequired
      .filter((f) => {
        if (f.value == null) return true;
        if (typeof f.value === "string" && f.value.trim() === "") return true;
        if (typeof f.value === "number" && f.value === 0 && f.field !== "deal_value") return true;
        return false;
      })
      .map((f) => f.field);

    const missingOptional = allOptional
      .filter((f) => {
        if (f.value == null) return true;
        if (typeof f.value === "string" && f.value.trim() === "") return true;
        return false;
      })
      .map((f) => f.field);

    // Generate recommendations
    const recommendations: string[] = [];
    if (missingRequired.length > 0) {
      recommendations.push(`Fill in ${missingRequired.length} required field(s): ${missingRequired.slice(0, 3).join(", ")}`);
    }
    if (missingOptional.length > 5) {
      recommendations.push(`Consider adding ${missingOptional.length} optional fields to improve data quality`);
    }
    if (overallScore < 70) {
      recommendations.push("Data completeness is below 70% - review and update missing fields");
    }

    // Calculate breakdown
    const dealRequiredPresent = dealRequired.filter((f) => f.value != null && f.value !== "").length;
    const leadRequiredPresent = lead ? leadRequired.filter((f) => f.value != null && f.value !== "").length : 0;
    const dealFlowRequiredPresent = dealFlow
      ? dealFlowRequired.filter((f) => f.value != null && f.value !== "").length
      : 0;

    return {
      dealId,
      submissionId,
      score: {
        required: requiredScore,
        optional: optionalScore,
        overall: overallScore,
        missingRequired,
        missingOptional,
        recommendations,
      },
      breakdown: {
        mondayDeals: Math.round((dealRequiredPresent / dealRequired.length) * 100),
        leads: lead ? Math.round((leadRequiredPresent / leadRequired.length) * 100) : 0,
        dealFlow: dealFlow
          ? Math.round((dealFlowRequiredPresent / dealFlowRequired.length) * 100)
          : 0,
      },
    };
  } catch (error) {
    console.error("[completeness-scoring] Error calculating completeness:", error);
    return null;
  }
}

/**
 * Calculate completeness for multiple deals
 */
export async function calculateBulkCompleteness(
  dealIds: number[]
): Promise<Map<number, DealCompleteness>> {
  const results = new Map<number, DealCompleteness>();

  // Process in batches of 10 to avoid overwhelming the database
  const batchSize = 10;
  for (let i = 0; i < dealIds.length; i += batchSize) {
    const batch = dealIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((dealId) => calculateDealCompleteness(dealId))
    );

    batchResults.forEach((result) => {
      if (result) {
        results.set(result.dealId, result);
      }
    });
  }

  return results;
}


