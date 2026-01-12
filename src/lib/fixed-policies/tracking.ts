/**
 * Fixed Policies Tracking
 * Handles creation and management of fixed policy tracking records
 */

import { supabase } from "@/lib/supabase";
import { isFixedStatus } from "./status-transitions";

export type FixedPolicyTrackingRecord = {
  id: string;
  deal_id: number | null;
  submission_id: string;
  retention_agent_id: string | null;
  retention_agent_name: string;
  fixed_at: string;
  status_when_fixed: string;
  draft_date: string | null;
  notes: string | null;
  disposition: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Create a tracking record for a fixed policy
 * 
 * @param params - Parameters for the tracking record
 * @returns The created tracking record or null if creation failed
 */
export async function createFixedPolicyTracking(params: {
  dealId?: number | null;
  submissionId: string;
  retentionAgentId?: string | null;
  retentionAgentName: string;
  statusWhenFixed: string;
  draftDate?: string | null;
  notes?: string | null;
  disposition?: string | null;
}): Promise<FixedPolicyTrackingRecord | null> {
  try {
    console.log("[fixed-policies] createFixedPolicyTracking called with params:", params);
    
    // Check if tracking record already exists for this submission
    const { data: existing, error: existingError } = await supabase
      .from("fixed_policies_tracking")
      .select("id")
      .eq("submission_id", params.submissionId)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      // PGRST116 is "not found" which is expected for new records
      console.error("[fixed-policies] Error checking existing record:", existingError);
      throw existingError;
    }

    if (existing) {
      console.log("[fixed-policies] Updating existing tracking record:", existing.id);
      // Update existing record instead of creating duplicate
      const { data, error } = await supabase
        .from("fixed_policies_tracking")
        .update({
          deal_id: params.dealId ?? null,
          retention_agent_id: params.retentionAgentId ?? null,
          retention_agent_name: params.retentionAgentName,
          status_when_fixed: params.statusWhenFixed,
          draft_date: params.draftDate ?? null,
          notes: params.notes ?? null,
          disposition: params.disposition ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        console.error("[fixed-policies] Error updating tracking record:", error);
        throw error;
      }
      console.log("[fixed-policies] Successfully updated tracking record");
      return data as FixedPolicyTrackingRecord;
    }

    console.log("[fixed-policies] Creating new tracking record");
    // Create new tracking record
    const { data, error } = await supabase
      .from("fixed_policies_tracking")
      .insert({
        deal_id: params.dealId ?? null,
        submission_id: params.submissionId,
        retention_agent_id: params.retentionAgentId ?? null,
        retention_agent_name: params.retentionAgentName,
        status_when_fixed: params.statusWhenFixed,
        draft_date: params.draftDate ?? null,
        notes: params.notes ?? null,
        disposition: params.disposition ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[fixed-policies] Error inserting tracking record:", error);
      console.error("[fixed-policies] Error details:", JSON.stringify(error, null, 2));
      throw error;
    }
    
    console.log("[fixed-policies] Successfully created tracking record:", data?.id);
    return data as FixedPolicyTrackingRecord;
  } catch (error) {
    console.error("[fixed-policies] Error in createFixedPolicyTracking:", error);
    if (error instanceof Error) {
      console.error("[fixed-policies] Error message:", error.message);
      console.error("[fixed-policies] Error stack:", error.stack);
    }
    return null;
  }
}

/**
 * Check if a status update should trigger fixed policy tracking
 * 
 * @param status - The status value to check
 * @returns true if the status indicates a fixed policy
 */
export function shouldTrackAsFixed(status: string | null | undefined): boolean {
  return isFixedStatus(status);
}

/**
 * Get all fixed policies with current status from monday_com_deals
 * 
 * @param filters - Optional filters
 * @returns Array of fixed policies with current status
 */
export async function getFixedPoliciesWithCurrentStatus(filters?: {
  retentionAgentName?: string;
  statusWhenFixed?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    let query = supabase
      .from("fixed_policies_tracking")
      .select(`
        *,
        monday_com_deals!left(
          id,
          policy_number,
          carrier,
          ghl_name,
          deal_name,
          phone_number,
          policy_status,
          ghl_stage,
          status
        )
      `)
      .order("fixed_at", { ascending: false });

    if (filters?.retentionAgentName) {
      query = query.eq("retention_agent_name", filters.retentionAgentName);
    }

    if (filters?.statusWhenFixed) {
      query = query.eq("status_when_fixed", filters.statusWhenFixed);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, (filters.offset + (filters.limit || 100)) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("[fixed-policies] Error fetching fixed policies:", error);
    return [];
  }
}

