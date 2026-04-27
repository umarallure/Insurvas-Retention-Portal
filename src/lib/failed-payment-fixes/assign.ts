import { supabase } from "@/lib/supabase";
import { checkTcpaStatus, type TcpaCheckResult } from "./tcpa";

export type AssignFailedPaymentFixInput = {
  failedPaymentFixId: string;
  assigneeProfileId: string;
  assignedByProfileId: string;
  phoneNumber: string | null;
  skipTcpa?: boolean;
};

export type AssignFailedPaymentFixResult =
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

export async function assignFailedPaymentFix(
  input: AssignFailedPaymentFixInput
): Promise<AssignFailedPaymentFixResult> {
  const tcpa = input.skipTcpa
    ? { status: "clear" as const, message: "", normalizedPhone: null, errors: [] }
    : await checkTcpaStatus(input.phoneNumber);

  if (tcpa.status === "tcpa") {
    const { error } = await supabase
      .from("failed_payment_fixes")
      .update({
        is_active: false,
        tcpa_flag: true,
        tcpa_checked_at: new Date().toISOString(),
        tcpa_message: tcpa.message.slice(0, 2000),
      })
      .eq("id", input.failedPaymentFixId);

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
    .from("failed_payment_fixes")
    .update({
      assigned: true,
      assigned_to_profile_id: input.assigneeProfileId,
      assigned_by_profile_id: input.assignedByProfileId,
      assigned_at: nowIso,
      tcpa_flag: false,
      tcpa_checked_at: nowIso,
      tcpa_message: tcpa.status === "dnc" ? tcpa.message.slice(0, 2000) : null,
    })
    .eq("id", input.failedPaymentFixId);

  if (error) {
    return { ok: false, action: "error", error: `Assignment failed: ${error.message}`, tcpa };
  }

  return { ok: true, action: "assigned", tcpa };
}

export async function unassignFailedPaymentFix(
  failedPaymentFixId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("failed_payment_fixes")
    .update({
      assigned: false,
      assigned_to_profile_id: null,
      assigned_by_profile_id: null,
      assigned_at: null,
      is_active: false,
    })
    .eq("id", failedPaymentFixId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
