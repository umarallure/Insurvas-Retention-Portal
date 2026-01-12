/**
 * Handled Policies Tracking
 * Tracks policies that agents have worked on (handled) but not yet marked as fixed
 */

import { supabase } from "@/lib/supabase";
import type { DateRange } from "react-day-picker";

export interface HandledPolicy {
  submission_id: string;
  deal_id: number | null;
  retention_agent: string;
  retention_agent_id: string | null;
  status: string | null;
  draft_date: string | null;
  notes: string | null;
  policy_number: string | null;
  carrier: string | null;
  monthly_premium: number | null;
  created_at: string;
  updated_at: string;
  monday_com_deals: {
    id: number;
    policy_number: string | null;
    ghl_name: string | null;
    deal_name: string | null;
    phone_number: string | null;
    carrier: string | null;
    policy_status: string | null;
  } | null;
}

type MondayDealRow = {
  id: number;
  policy_number: string | null;
  ghl_name: string | null;
  deal_name: string | null;
  phone_number: string | null;
  carrier: string | null;
  policy_status: string | null;
  monday_item_id: string | null;
};

/**
 * Get policies handled by a specific agent
 */
export async function getHandledPoliciesByAgent(
  profileId: string,
  agentName: string
): Promise<HandledPolicy[]> {
  // First, fetch retention_deal_flow entries for this agent
  const { data: retentionFlowData, error } = await supabase
    .from("retention_deal_flow")
    .select(`
      submission_id,
      retention_agent,
      retention_agent_id,
      status,
      draft_date,
      notes,
      policy_number,
      carrier,
      monthly_premium,
      created_at,
      updated_at
    `)
    .eq("retention_agent", agentName)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[handled-policies] Error fetching handled policies:", error);
    return [];
  }

  if (!retentionFlowData || retentionFlowData.length === 0) {
    return [];
  }

  // Filter out policies that are already marked as fixed
  const { data: fixedPolicies } = await supabase
    .from("fixed_policies_tracking")
    .select("submission_id")
    .not("submission_id", "is", null);

  const fixedSubmissionIds = new Set(
    (fixedPolicies ?? []).map((fp) => fp.submission_id as string)
  );

  // Filter out fixed policies
  const unfixedPolicies = (retentionFlowData ?? []).filter(
    (policy) => !fixedSubmissionIds.has(policy.submission_id)
  );

  if (unfixedPolicies.length === 0) {
    return [];
  }

  // Get unique submission_ids to fetch monday_com_deals
  const submissionIds = Array.from(
    new Set(unfixedPolicies.map((p) => p.submission_id).filter(Boolean))
  ) as string[];

  // Fetch monday_com_deals by matching monday_item_id to submission_id
  const { data: mondayDeals, error: dealsError } = await supabase
    .from("monday_com_deals")
    .select("id, policy_number, ghl_name, deal_name, phone_number, carrier, policy_status, monday_item_id")
    .in("monday_item_id", submissionIds)
    .eq("is_active", true);

  if (dealsError) {
    console.error("[handled-policies] Error fetching monday deals:", dealsError);
  }

  // Create a map of monday_item_id -> deal
  const dealsBySubmissionId = new Map<string, MondayDealRow>();
  (mondayDeals ?? []).forEach((deal) => {
    const mondayItemId = typeof deal.monday_item_id === "string" ? deal.monday_item_id.trim() : null;
    if (mondayItemId && deal) {
      dealsBySubmissionId.set(mondayItemId, deal as MondayDealRow);
    }
  });

  // Map retention flow data with monday deals
  return unfixedPolicies.map((policy) => {
    const mondayDeal = dealsBySubmissionId.get(policy.submission_id) ?? null;
    
    return {
      submission_id: policy.submission_id,
      deal_id: mondayDeal?.id ?? null,
      retention_agent: policy.retention_agent,
      retention_agent_id: policy.retention_agent_id,
      status: policy.status,
      draft_date: policy.draft_date,
      notes: policy.notes,
      policy_number: policy.policy_number,
      carrier: policy.carrier,
      monthly_premium: policy.monthly_premium,
      created_at: policy.created_at,
      updated_at: policy.updated_at,
      monday_com_deals: mondayDeal ? {
        id: mondayDeal.id,
        policy_number: typeof mondayDeal.policy_number === "string" ? mondayDeal.policy_number : null,
        ghl_name: typeof mondayDeal.ghl_name === "string" ? mondayDeal.ghl_name : null,
        deal_name: typeof mondayDeal.deal_name === "string" ? mondayDeal.deal_name : null,
        phone_number: typeof mondayDeal.phone_number === "string" ? mondayDeal.phone_number : null,
        carrier: typeof mondayDeal.carrier === "string" ? mondayDeal.carrier : null,
        policy_status: typeof mondayDeal.policy_status === "string" ? mondayDeal.policy_status : null,
      } : null,
    };
  }) as HandledPolicy[];
}

/**
 * Get all handled policies (for managers)
 */
export async function getAllHandledPolicies(
  filters?: {
    agentName?: string;
    range?: DateRange;
  }
): Promise<HandledPolicy[]> {
  // First, fetch retention_deal_flow entries
  let query = supabase
    .from("retention_deal_flow")
    .select(`
      submission_id,
      retention_agent,
      retention_agent_id,
      status,
      draft_date,
      notes,
      policy_number,
      carrier,
      monthly_premium,
      created_at,
      updated_at
    `)
    .not("retention_agent", "is", null)
    .order("updated_at", { ascending: false });

  if (filters?.agentName) {
    query = query.eq("retention_agent", filters.agentName);
  }

  if (filters?.range?.from) {
    query = query.gte("updated_at", filters.range.from.toISOString());
  }

  if (filters?.range?.to) {
    query = query.lte("updated_at", filters.range.to.toISOString());
  }

  const { data: retentionFlowData, error } = await query;

  if (error) {
    console.error("[handled-policies] Error fetching handled policies:", error);
    return [];
  }

  if (!retentionFlowData || retentionFlowData.length === 0) {
    return [];
  }

  // Filter out policies that are already marked as fixed
  const { data: fixedPolicies } = await supabase
    .from("fixed_policies_tracking")
    .select("submission_id")
    .not("submission_id", "is", null);

  const fixedSubmissionIds = new Set(
    (fixedPolicies ?? []).map((fp) => fp.submission_id as string)
  );

  // Filter out fixed policies
  const unfixedPolicies = (retentionFlowData ?? []).filter(
    (policy) => !fixedSubmissionIds.has(policy.submission_id)
  );

  if (unfixedPolicies.length === 0) {
    return [];
  }

  // Get unique submission_ids to fetch monday_com_deals
  const submissionIds = Array.from(
    new Set(unfixedPolicies.map((p) => p.submission_id).filter(Boolean))
  ) as string[];

  // Fetch monday_com_deals by matching monday_item_id to submission_id
  const { data: mondayDeals, error: dealsError } = await supabase
    .from("monday_com_deals")
    .select("id, policy_number, ghl_name, deal_name, phone_number, carrier, policy_status, monday_item_id")
    .in("monday_item_id", submissionIds)
    .eq("is_active", true);

  if (dealsError) {
    console.error("[handled-policies] Error fetching monday deals:", dealsError);
  }

  // Create a map of monday_item_id -> deal
  const dealsBySubmissionId = new Map<string, MondayDealRow>();
  (mondayDeals ?? []).forEach((deal) => {
    const mondayItemId = typeof deal.monday_item_id === "string" ? deal.monday_item_id.trim() : null;
    if (mondayItemId && deal) {
      dealsBySubmissionId.set(mondayItemId, deal as MondayDealRow);
    }
  });

  // Map retention flow data with monday deals
  return unfixedPolicies.map((policy) => {
    const mondayDeal = dealsBySubmissionId.get(policy.submission_id) ?? null;
    
    return {
      submission_id: policy.submission_id,
      deal_id: mondayDeal?.id ?? null,
      retention_agent: policy.retention_agent,
      retention_agent_id: policy.retention_agent_id,
      status: policy.status,
      draft_date: policy.draft_date,
      notes: policy.notes,
      policy_number: policy.policy_number,
      carrier: policy.carrier,
      monthly_premium: policy.monthly_premium,
      created_at: policy.created_at,
      updated_at: policy.updated_at,
      monday_com_deals: mondayDeal ? {
        id: mondayDeal.id,
        policy_number: typeof mondayDeal.policy_number === "string" ? mondayDeal.policy_number : null,
        ghl_name: typeof mondayDeal.ghl_name === "string" ? mondayDeal.ghl_name : null,
        deal_name: typeof mondayDeal.deal_name === "string" ? mondayDeal.deal_name : null,
        phone_number: typeof mondayDeal.phone_number === "string" ? mondayDeal.phone_number : null,
        carrier: typeof mondayDeal.carrier === "string" ? mondayDeal.carrier : null,
        policy_status: typeof mondayDeal.policy_status === "string" ? mondayDeal.policy_status : null,
      } : null,
    };
  }) as HandledPolicy[];
}

/**
 * Check if draft date has passed (for agent to mark as fixed)
 */
export function canAgentMarkAsFixed(draftDate: string | null): boolean {
  if (!draftDate) return false;
  
  const draft = new Date(draftDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  draft.setHours(0, 0, 0, 0);
  
  return draft <= today;
}

