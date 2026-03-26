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

    const isDisqualified = request.disposition === "DQ";

    // Get source deal context for history and related-deals cascade.
    const { data: sourceDeal, error: fetchError } = await supabase
      .from("monday_com_deals")
      .select("id, monday_item_id, policy_number, disposition, disposition_count, phone_number, ghl_name, deal_name")
      .eq("id", request.dealId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!sourceDeal) throw new Error("Deal not found");

    let targetDeals: Array<{
      id: number;
      monday_item_id: string | null;
      policy_number: string | null;
      disposition: string | null;
      disposition_count: number | null;
    }> = [
      {
        id: sourceDeal.id as number,
        monday_item_id: (sourceDeal.monday_item_id as string | null) ?? null,
        policy_number: (sourceDeal.policy_number as string | null) ?? null,
        disposition: (sourceDeal.disposition as string | null) ?? null,
        disposition_count: (sourceDeal.disposition_count as number | null) ?? 0,
      },
    ];

    if (isDisqualified) {
      const phone = typeof sourceDeal.phone_number === "string" ? sourceDeal.phone_number.trim() : "";
      const ghlName = typeof sourceDeal.ghl_name === "string" ? sourceDeal.ghl_name.trim() : "";
      const dealName = typeof sourceDeal.deal_name === "string" ? sourceDeal.deal_name.trim() : "";
      const orParts: string[] = [];
      if (phone) orParts.push(`phone_number.eq.${phone}`);
      if (ghlName) orParts.push(`ghl_name.ilike.%${ghlName.replace(/,/g, "")}%`);
      if (dealName) orParts.push(`deal_name.ilike.%${dealName.replace(/,/g, "")}%`);

      if (orParts.length > 0) {
        const { data: relatedDeals, error: relatedDealsError } = await supabase
          .from("monday_com_deals")
          .select("id, monday_item_id, policy_number, disposition, disposition_count")
          .or(orParts.join(","))
          .limit(100);

        if (relatedDealsError) throw relatedDealsError;
        const mapped = (relatedDeals ?? [])
          .map((row) => {
            const id = typeof row.id === "number" ? row.id : null;
            if (id == null) return null;
            return {
              id,
              monday_item_id: typeof row.monday_item_id === "string" ? row.monday_item_id : null,
              policy_number: typeof row.policy_number === "string" ? row.policy_number : null,
              disposition: typeof row.disposition === "string" ? row.disposition : null,
              disposition_count: typeof row.disposition_count === "number" ? row.disposition_count : 0,
            };
          })
          .filter((row): row is {
            id: number;
            monday_item_id: string | null;
            policy_number: string | null;
            disposition: string | null;
            disposition_count: number | null;
          } => row !== null);
        if (mapped.length > 0) {
          targetDeals = mapped;
        }
      }
    }

    const basePayload: Record<string, unknown> = {
      disposition: request.disposition,
      disposition_date: new Date().toISOString(),
      disposition_agent_id: request.agentId,
      disposition_agent_name: request.agentName,
      disposition_notes: request.notes || null,
      callback_datetime: request.callbackDatetime || null,
      updated_at: new Date().toISOString(),
    };
    if (isDisqualified) {
      basePayload.is_active = false;
    }

    for (const deal of targetDeals) {
      const { error: updateError } = await supabase
        .from("monday_com_deals")
        .update({
          ...basePayload,
          disposition_count: (deal.disposition_count ?? 0) + 1,
        })
        .eq("id", deal.id);
      if (updateError) throw updateError;
    }

    if (isDisqualified) {
      const { error: unassignError } = await supabase
        .from("retention_assigned_leads")
        .delete()
        .in("deal_id", targetDeals.map((d) => d.id))
        .eq("status", "active");

      if (unassignError) throw unassignError;
    }

    const historyRows = targetDeals.map((deal) => ({
      deal_id: deal.id,
      monday_item_id: deal.monday_item_id ?? request.mondayItemId ?? null,
      policy_number: deal.policy_number ?? request.policyNumber ?? null,
      disposition: request.disposition,
      disposition_notes: request.notes || null,
      callback_datetime: request.callbackDatetime || null,
      agent_id: request.agentId,
      agent_name: request.agentName,
      agent_type: request.agentType,
      policy_status: request.policyStatus || null,
      ghl_stage: request.ghlStage || null,
      previous_disposition: deal.disposition || null,
    }));

    const { error: historyError } = await supabase
      .from("disposition_history")
      .insert(historyRows);

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
      message:
        isDisqualified && targetDeals.length > 1
          ? `Disposition saved successfully for ${targetDeals.length} related policies`
          : "Disposition saved successfully",
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
