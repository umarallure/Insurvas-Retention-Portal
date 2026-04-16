import { supabase } from "@/lib/supabase";
import { checkTcpaStatus, type TcpaCheckResult } from "./tcpa";

export type AssignCallBackDealInput = {
  callBackDealId: string;
  assigneeProfileId: string;
  assignedByProfileId: string;
  phoneNumber: string | null;
};

export type AssignCallBackDealResult =
  | {
      ok: true;
      action: "assigned";
      tcpa: TcpaCheckResult;
    }
  | {
      ok: false;
      action: "tcpa_blocked";
      tcpa: TcpaCheckResult;
    }
  | {
      ok: false;
      action: "error";
      error: string;
      tcpa?: TcpaCheckResult;
    };

/**
 * Runs a TCPA check first, then assigns the call-back deal to the given agent.
 * If TCPA is detected, the row is marked `is_active = false, tcpa_flag = true` and
 * the assignment is blocked. DNC alone does NOT block.
 */
export async function assignCallBackDeal(input: AssignCallBackDealInput): Promise<AssignCallBackDealResult> {
  const tcpa = await checkTcpaStatus(input.phoneNumber);

  if (tcpa.status === "tcpa") {
    const { error } = await supabase
      .from("call_back_deals")
      .update({
        is_active: false,
        tcpa_flag: true,
        tcpa_checked_at: new Date().toISOString(),
        tcpa_message: tcpa.message.slice(0, 2000),
      })
      .eq("id", input.callBackDealId);

    if (error) {
      return {
        ok: false,
        action: "error",
        error: `TCPA marking failed: ${error.message}`,
        tcpa,
      };
    }

    return { ok: false, action: "tcpa_blocked", tcpa };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("call_back_deals")
    .update({
      assigned: true,
      assigned_to_profile_id: input.assigneeProfileId,
      assigned_by_profile_id: input.assignedByProfileId,
      assigned_at: nowIso,
      tcpa_flag: false,
      tcpa_checked_at: nowIso,
      tcpa_message: tcpa.status === "dnc" ? tcpa.message.slice(0, 2000) : null,
    })
    .eq("id", input.callBackDealId);

  if (error) {
    return { ok: false, action: "error", error: `Assignment failed: ${error.message}`, tcpa };
  }

  return { ok: true, action: "assigned", tcpa };
}

export async function unassignCallBackDeal(callBackDealId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("call_back_deals")
    .update({
      assigned: false,
      assigned_to_profile_id: null,
      assigned_by_profile_id: null,
      assigned_at: null,
    })
    .eq("id", callBackDealId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
