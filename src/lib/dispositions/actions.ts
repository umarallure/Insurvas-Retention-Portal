/**
 * Disposition Actions Handler
 * Handles saving dispositions and triggering appropriate actions
 */

import { supabase } from "@/lib/supabase";
import type {
  DispositionSaveRequest,
  DispositionActionResult,
  GHLAction,
  Disposition,
} from "./types";
import { affectsGHL, normalizePolicyStatus } from "./rules";

/**
 * Save disposition to database and trigger appropriate actions
 */
export async function saveDisposition(
  request: DispositionSaveRequest
): Promise<DispositionActionResult> {
  try {
    // Validate dealId
    if (!request.dealId) {
      throw new Error("Deal ID is required");
    }

    // Get current disposition for history
    const { data: currentDeal, error: fetchError } = await supabase
      .from("monday_com_deals")
      .select("disposition, disposition_count")
      .eq("id", request.dealId)
      .maybeSingle();

    if (fetchError) console.log(fetchError);

    const previousDisposition = currentDeal?.disposition || null;
    const currentCount = currentDeal?.disposition_count || 0;

    // Update monday_com_deals with new disposition
    const updatePayload = {
      disposition: request.disposition,
      disposition_date: new Date().toISOString(),
      disposition_agent_id: request.agentId,
      disposition_agent_name: request.agentName,
      disposition_notes: request.notes || null,
      callback_datetime: request.callbackDatetime || null,
      disposition_count: currentCount + 1,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("monday_com_deals")
      .update(updatePayload)
      .eq("id", request.dealId)
      .select();

    if (updateError) console.log(updateError);

    // Insert into disposition_history
    const { error: historyError } = await supabase
      .from("disposition_history")
      .insert({
        deal_id: request.dealId,
        monday_item_id: request.mondayItemId || null,
        policy_number: request.policyNumber || null,
        disposition: request.disposition,
        disposition_notes: request.notes || null,
        callback_datetime: request.callbackDatetime || null,
        agent_id: request.agentId,
        agent_name: request.agentName,
        agent_type: request.agentType,
        policy_status: request.policyStatus || null,
        ghl_stage: request.ghlStage || null,
        previous_disposition: previousDisposition,
      });

    if (historyError) throw historyError;

    // Determine GHL action if disposition affects GHL
    let ghlAction: GHLAction | undefined;
    if (affectsGHL(request.disposition)) {
      ghlAction = determineGHLAction(
        request.disposition,
        request.policyStatus || "",
        request.notes
      );
    }

    return {
      success: true,
      message: "Disposition saved successfully",
      ghlAction,
    };
  } catch (error) {
    console.error("Error saving disposition:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save disposition",
    };
  }
}

/**
 * Determine what GHL action should be taken based on disposition
 * This is a placeholder for future GHL integration
 */
function determineGHLAction(
  disposition: Disposition,
  policyStatus: string,
  notes?: string
): GHLAction {
  const normalizedStatus = normalizePolicyStatus(policyStatus);

  // New Sale disposition logic
  if (disposition === "New Sale") {
    if (normalizedStatus === "Failed Payment" || normalizedStatus === "Pending Lapse") {
      // Move original lead to Chargeback Cancellation
      // Create new opportunity in Pending Approval
      return {
        type: "create_opportunity",
        data: {
          action: "move_original_to_chargeback_cancellation",
          create_new_opportunity: true,
          new_stage: "Pending Approval",
          notes: notes || "New sale - original policy not being fixed",
        },
      };
    }

    if (normalizedStatus === "Chargeback") {
      // Move to Pending Chargeback Fix
      // Create new opportunity in Pending Approval
      return {
        type: "create_opportunity",
        data: {
          action: "move_to_pending_chargeback_fix",
          create_new_opportunity: true,
          new_stage: "Pending Approval",
        },
      };
    }

    if (normalizedStatus === "Needs to be Sold" || normalizedStatus === "Pending Manual Action") {
      // Send notification to LAs (to be implemented)
      return {
        type: "create_opportunity",
        data: {
          action: "notify_licensed_agents",
          policy_status: normalizedStatus,
        },
      };
    }
  }

  // Updating Banking/Draft Date disposition
  if (disposition === "Updating Banking/Draft Date") {
    return {
      type: "move_stage",
      stage: "Pending Failed Payment Fix",
      notes: "Banking/draft date updated - awaiting redraft",
    };
  }

  // DQ dispositions
  if (disposition === "DQ" || disposition === "Chargeback DQ") {
    return {
      type: "move_stage",
      stage: "Chargeback DQ",
      notes: notes || "Disqualified",
    };
  }

  // Submitted disposition
  if (disposition === "Submitted") {
    return {
      type: "move_stage",
      stage: "Pending Approval",
      notes: "Application submitted",
    };
  }

  // Default: no GHL action needed
  return { type: "no_action" };
}

/**
 * Get disposition history for a deal
 */
export async function getDispositionHistory(dealId: number) {
  try {
    const { data, error } = await supabase
      .from("disposition_history")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("Error fetching disposition history:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch history",
      data: [],
    };
  }
}

/**
 * Execute GHL action (placeholder for future implementation)
 * This function will be implemented when GHL API integration is ready
 */
export async function executeGHLAction(
  action: GHLAction,
  dealId: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  void dealId;
  return {
    success: true,
    message: `GHL action queued: ${action.type}`,
  };
}

/**
 * Validate disposition before saving
 */
export async function validateDispositionRequest(
  request: DispositionSaveRequest
): Promise<{ valid: boolean; error?: string }> {
  // Check if deal exists
  const { data: deal, error } = await supabase
    .from("monday_com_deals")
    .select("id, policy_number")
    .eq("id", request.dealId)
    .maybeSingle();

  if (error || !deal) {
    return { valid: false, error: "Deal not found" };
  }

  // Check if callback datetime is provided when required
  if (request.disposition === "Needs Callback" && !request.callbackDatetime) {
    return { valid: false, error: "Callback date/time is required for 'Needs Callback' disposition" };
  }

  return { valid: true };
}
