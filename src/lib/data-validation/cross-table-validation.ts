/**
 * Cross-Table Data Validation
 * Validates data consistency across multiple tables
 */

import { supabase } from "@/lib/supabase";

export type ValidationResult = {
  field: string;
  value: string | number | null;
  source: string;
  consistent: boolean;
  issues?: string[];
};

export type CrossTableValidation = {
  submissionId: string;
  policyNumber?: ValidationResult;
  carrier?: ValidationResult;
  premium?: ValidationResult;
  agent?: ValidationResult;
  customerName?: ValidationResult;
  phoneNumber?: ValidationResult;
  overallConsistency: "Consistent" | "Inconsistent" | "Partial";
  consistencyScore: number; // 0-100
  issues: string[];
  recommendations: string[];
};

/**
 * Validate data consistency across all relevant tables for a submission
 */
export async function validateCrossTableData(
  submissionId: string
): Promise<CrossTableValidation | null> {
  try {
    // Fetch data from all relevant tables
    const [leadsData, dealFlowData, callResultsData, mondayDealsData] = await Promise.all([
      // Get lead data
      supabase
        .from("leads")
        .select("*")
        .eq("submission_id", submissionId)
        .maybeSingle(),

      // Get daily_deal_flow data
      supabase
        .from("daily_deal_flow")
        .select("*")
        .eq("submission_id", submissionId)
        .maybeSingle(),

      // Get call_results data
      supabase
        .from("call_results")
        .select("*")
        .eq("submission_id", submissionId)
        .maybeSingle(),

      // Get monday_com_deals data (using monday_item_id which often equals submission_id)
      supabase
        .from("monday_com_deals")
        .select("*")
        .eq("monday_item_id", submissionId)
        .maybeSingle(),
    ]);

    const lead = leadsData.data;
    const dealFlow = dealFlowData.data;
    const callResult = callResultsData.data;
    const mondayDeal = mondayDealsData.data;

    if (!lead && !dealFlow && !callResult && !mondayDeal) {
      return null; // No data found
    }

    // Validate Policy Number
    const policyNumbers = [
      { value: mondayDeal?.policy_number, source: "monday_com_deals" },
      { value: dealFlow?.policy_number, source: "daily_deal_flow" },
      { value: callResult?.policy_number, source: "call_results" },
    ].filter((item) => item.value != null);

    const policyNumberValidation = validateField(
      "policy_number",
      policyNumbers,
      "Policy number"
    );

    // Validate Carrier
    const carriers = [
      { value: mondayDeal?.carrier, source: "monday_com_deals" },
      { value: dealFlow?.carrier, source: "daily_deal_flow" },
      { value: callResult?.carrier, source: "call_results" },
      { value: lead?.carrier, source: "leads" },
    ].filter((item) => item.value != null);

    const carrierValidation = validateField("carrier", carriers, "Carrier");

    // Validate Premium
    const premiums = [
      { value: mondayDeal?.deal_value, source: "monday_com_deals" },
      { value: dealFlow?.monthly_premium, source: "daily_deal_flow" },
      { value: callResult?.monthly_premium, source: "call_results" },
      { value: lead?.monthly_premium, source: "leads" },
    ].filter((item) => item.value != null);

    const premiumValidation = validateField("premium", premiums, "Premium", true); // Allow small variance

    // Validate Agent
    const agents = [
      { value: mondayDeal?.sales_agent, source: "monday_com_deals" },
      { value: dealFlow?.agent, source: "daily_deal_flow" },
      { value: callResult?.agent_who_took_call, source: "call_results" },
      { value: callResult?.submitting_agent, source: "call_results" },
    ].filter((item) => item.value != null);

    const agentValidation = validateField("agent", agents, "Agent");

    // Validate Customer Name
    const customerNames = [
      { value: lead?.customer_full_name, source: "leads" },
      { value: dealFlow?.insured_name, source: "daily_deal_flow" },
      { value: mondayDeal?.deal_name, source: "monday_com_deals" },
      { value: mondayDeal?.ghl_name, source: "monday_com_deals" },
    ].filter((item) => item.value != null);

    const customerNameValidation = validateField("customer_name", customerNames, "Customer name");

    // Validate Phone Number
    const phoneNumbers = [
      { value: lead?.phone_number, source: "leads" },
      { value: dealFlow?.client_phone_number, source: "daily_deal_flow" },
      { value: mondayDeal?.phone_number, source: "monday_com_deals" },
    ].filter((item) => item.value != null);

    const phoneValidation = validateField("phone", phoneNumbers, "Phone number");

    // Calculate overall consistency
    const validations = [
      policyNumberValidation,
      carrierValidation,
      premiumValidation,
      agentValidation,
      customerNameValidation,
      phoneValidation,
    ];

    const consistentCount = validations.filter((v) => v?.consistent).length;
    const consistencyScore = Math.round((consistentCount / validations.length) * 100);

    let overallConsistency: "Consistent" | "Inconsistent" | "Partial";
    if (consistencyScore === 100) {
      overallConsistency = "Consistent";
    } else if (consistencyScore >= 70) {
      overallConsistency = "Partial";
    } else {
      overallConsistency = "Inconsistent";
    }

    // Collect issues
    const issues: string[] = [];
    validations.forEach((v) => {
      if (v && !v.consistent && v.issues) {
        issues.push(...v.issues);
      }
    });

    // Generate recommendations
    const recommendations: string[] = [];
    if (!policyNumberValidation?.consistent) {
      recommendations.push("Update policy number in all tables to ensure consistency");
    }
    if (!carrierValidation?.consistent) {
      recommendations.push("Verify and update carrier information across all tables");
    }
    if (!premiumValidation?.consistent) {
      recommendations.push("Review premium values - there may be discrepancies");
    }
    if (issues.length > 0) {
      recommendations.push(`Resolve ${issues.length} data inconsistency issue(s)`);
    }

    return {
      submissionId,
      policyNumber: policyNumberValidation,
      carrier: carrierValidation,
      premium: premiumValidation,
      agent: agentValidation,
      customerName: customerNameValidation,
      phoneNumber: phoneValidation,
      overallConsistency,
      consistencyScore,
      issues,
      recommendations,
    };
  } catch (error) {
    console.error("[cross-table-validation] Error validating data:", error);
    return null;
  }
}

/**
 * Validate a field across multiple sources
 */
function validateField(
  fieldName: string,
  sources: Array<{ value: unknown; source: string }>,
  displayName: string,
  allowVariance = false
): ValidationResult | undefined {
  if (sources.length === 0) {
    return {
      field: fieldName,
      value: null,
      source: "none",
      consistent: false,
      issues: [`${displayName} not found in any table`],
    };
  }

  if (sources.length === 1) {
    return {
      field: fieldName,
      value: String(sources[0].value ?? ""),
      source: sources[0].source,
      consistent: true,
    };
  }

  // Normalize values for comparison
  const normalizedValues = sources.map((s) => {
    const val = s.value;
    if (val == null) return null;
    if (typeof val === "number") {
      return allowVariance ? Math.round(val * 100) / 100 : val;
    }
    return String(val).trim().toUpperCase();
  });

  // Check if all values are the same
  const firstValue = normalizedValues[0];
  const allSame = normalizedValues.every((v) => v === firstValue);

  if (allSame) {
    return {
      field: fieldName,
      value: String(sources[0].value ?? ""),
      source: sources.map((s) => s.source).join(", "),
      consistent: true,
    };
  }

  // Values differ - find differences
  const uniqueValues = new Set(normalizedValues.filter((v) => v != null));
  const issues: string[] = [];
  uniqueValues.forEach((val) => {
    const matchingSources = sources.filter((s, idx) => normalizedValues[idx] === val);
    if (matchingSources.length < sources.length) {
      issues.push(
        `${displayName} mismatch: "${val}" in ${matchingSources.map((s) => s.source).join(", ")}`
      );
    }
  });

  return {
    field: fieldName,
    value: String(sources[0].value ?? ""),
    source: sources.map((s) => s.source).join(", "),
    consistent: false,
    issues,
  };
}

/**
 * Check if submission exists in all relevant tables
 */
export async function checkSubmissionExistence(submissionId: string): Promise<{
  exists: {
    leads: boolean;
    dealFlow: boolean;
    callResults: boolean;
    sessions: boolean;
    mondayDeals: boolean;
  };
  missing: string[];
}> {
  const [leadsCheck, dealFlowCheck, callResultsCheck, sessionsCheck, mondayDealsCheck] =
    await Promise.all([
      supabase.from("leads").select("id").eq("submission_id", submissionId).maybeSingle(),
      supabase.from("daily_deal_flow").select("id").eq("submission_id", submissionId).maybeSingle(),
      supabase.from("call_results").select("id").eq("submission_id", submissionId).maybeSingle(),
      supabase
        .from("verification_sessions")
        .select("id")
        .eq("submission_id", submissionId)
        .maybeSingle(),
      supabase
        .from("monday_com_deals")
        .select("id")
        .eq("monday_item_id", submissionId)
        .maybeSingle(),
    ]);

  const exists = {
    leads: !!leadsCheck.data,
    dealFlow: !!dealFlowCheck.data,
    callResults: !!callResultsCheck.data,
    sessions: !!sessionsCheck.data,
    mondayDeals: !!mondayDealsCheck.data,
  };

  const missing: string[] = [];
  if (!exists.leads) missing.push("leads");
  if (!exists.dealFlow) missing.push("daily_deal_flow");
  if (!exists.callResults) missing.push("call_results");
  if (!exists.sessions) missing.push("verification_sessions");
  if (!exists.mondayDeals) missing.push("monday_com_deals");

  return { exists, missing };
}


