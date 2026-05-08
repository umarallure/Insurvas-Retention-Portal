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

export type TcpaBulkCheckResult = {
  checked: number;
  tcpaFound: number;
  clear: number;
  errors: number;
};

export async function checkTcpaForFailedPaymentFixes(
  options: {
    agencyFilter?: string[];
    carrierFilter?: string[];
    stageFilter?: string[];
    statusFilter?: string[];
    search?: string;
  } = {}
): Promise<TcpaBulkCheckResult> {
  let query = supabase
    .from("failed_payment_fixes")
    .select("id, phone_number, name, policy_number", { count: "exact" })
    .eq("is_active", true)
    .eq("assigned", true)
    .eq("tcpa_flag", false)
    .or("tcpa_checked_at.is.null,tcpa_checked_at.eq.1990-01-01");

  if (options.agencyFilter && options.agencyFilter.length > 0) {
    query = query.in("assigned_agency", options.agencyFilter);
  }
  if (options.carrierFilter && options.carrierFilter.length > 0) {
    query = query.in("carrier", options.carrierFilter);
  }
  if (options.stageFilter && options.stageFilter.length > 0) {
    query = query.in("ghl_stage", options.stageFilter);
  }
  if (options.statusFilter && options.statusFilter.length > 0) {
    query = query.in("policy_status", options.statusFilter);
  }
  if (options.search && options.search.trim()) {
    const escaped = options.search.trim().replace(/,/g, "");
    query = query.or(
      `name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%,policy_number.ilike.%${escaped}%`,
    );
  }

  const PAGE_SIZE = 1000;
  let checked = 0;
  let tcpaFound = 0;
  let clear = 0;
  let errors = 0;
  let from = 0;

  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; phone_number: string | null; name: string | null; policy_number: string }[];

    const results = await Promise.allSettled(
      rows.map(async (row) => {
        if (!row.phone_number) return { status: "skip" as const };
        const tcpaResult = await checkTcpaStatus(row.phone_number);
        if (tcpaResult.status === "tcpa") {
          await supabase
            .from("failed_payment_fixes")
            .update({
              is_active: false,
              tcpa_flag: true,
              tcpa_checked_at: new Date().toISOString(),
              tcpa_message: tcpaResult.message.slice(0, 2000),
            })
            .eq("id", row.id);
          return { status: "tcpa" as const };
        }
        await supabase
          .from("failed_payment_fixes")
          .update({
            tcpa_flag: false,
            tcpa_checked_at: new Date().toISOString(),
            tcpa_message: tcpaResult.status === "dnc" ? tcpaResult.message.slice(0, 2000) : null,
          })
          .eq("id", row.id);
        return { status: "clear" as const };
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.status === "tcpa") tcpaFound++;
        else if (r.value.status === "clear") clear++;
      } else {
        errors++;
      }
    }
    checked += rows.length;

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { checked, tcpaFound, clear, errors };
}
