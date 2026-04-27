import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

const TARGET_GHL_STAGES = [
  "Chargeback Cancellation",
  "Chargeback Failed Payment",
  "FDPF Incorrect Banking Info",
  "FDPF Insufficient Funds",
  "FDPF Pending Reason",
  "Pending Lapse Incorrect Banking Info",
  "Pending Lapse Insufficient Funds",
  "Pending Lapse Pending Reason",
  "Pending Lapse Unauthorized Draft",
  "Pending Manual Action",
] as const;

type SyncResponse =
  | {
      ok: true;
      fetched: number;
      upserted: number;
      skipped: number;
      stages: string[];
    }
  | {
      ok: false;
      error: string;
    };

type ExternalLeadRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  policy_number: string;
  carrier: string | null;
  carrier_id: string | null;
  agency_carrier_id: string | null;
  policy_type: string | null;
  policy_status: string | null;
  carrier_status: string | null;
  ghl_name: string | null;
  ghl_stage: string | null;
  deal_value: number | null;
  cc_value: number | null;
  charge_back: number | null;
  deal_creation_date: string | null;
  effective_date: string | null;
  commission_type: string | null;
  writing_number: string | null;
  cc_pmt_ws: string | null;
  cc_cb_ws: string | null;
  status: string | null;
  tasks: string | null;
  notes: string | null;
  call_center: string | null;
  sales_agent: string | null;
  failure_reason: string | null;
  failure_date: string | null;
  retry_count: number | null;
  retry_scheduled_at: string | null;
  daily_deal_flow_fetched: boolean | null;
  daily_deal_flow_fetched_at: string | null;
};

function getBearerToken(req: NextApiRequest) {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

function getExternalSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_FAILED_PAYMENTS_SUPABASE_URL;
  const key = process.env.FAILED_PAYMENTS_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Failed Payments Supabase credentials not configured");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SyncResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing Authorization Bearer token" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!profile?.id) {
      return res.status(403).json({ ok: false, error: "No profile found for user" });
    }

    const { data: managerRow, error: managerErr } = await supabaseAdmin
      .from("retention_managers")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("active", true)
      .maybeSingle();

    if (managerErr) {
      console.error("[failed-payment-fixes/sync] manager lookup error", managerErr);
      return res.status(500).json({ ok: false, error: "Failed to verify manager access" });
    }

    if (!managerRow?.id) {
      return res.status(403).json({ ok: false, error: "Only retention managers can sync failed payment fixes" });
    }

    console.log("[failed-payment-fixes/sync] Starting sync...");

    const external = getExternalSupabaseAdmin();

    console.log("[failed-payment-fixes/sync] Fetching from deal_tracker with ghl_stage filter...");
    const PAGE_SIZE = 1000;
    const allLeads: ExternalLeadRow[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await external
        .from("deal_tracker")
        .select("*")
        .in("ghl_stage", [...TARGET_GHL_STAGES])
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error("[failed-payment-fixes/sync] External fetch error", error);
        return res.status(500).json({ ok: false, error: `External fetch failed: ${error.message}` });
      }

      const batch = (data ?? []) as unknown as ExternalLeadRow[];
      allLeads.push(...batch);
      console.log(`[failed-payment-fixes/sync] Fetched batch: ${batch.length} records (offset: ${offset})`);

      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    console.log("[failed-payment-fixes/sync] Fetched leads:", allLeads.length);

    const policyNumbers = Array.from(
      new Set(
        allLeads
          .map((row) => row.policy_number)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    console.log("[failed-payment-fixes/sync] Policy numbers found:", policyNumbers.length);

    console.log("[failed-payment-fixes/sync] Checking existing records in failed_payment_fixes...");
    const existingByPolicyNumber = new Map<string, { assigned: boolean; assigned_to_profile_id: string | null }>();
    if (policyNumbers.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < policyNumbers.length; i += CHUNK) {
        const chunk = policyNumbers.slice(i, i + CHUNK);
        const { data: existing, error: existingErr } = await supabaseAdmin
          .from("failed_payment_fixes")
          .select("policy_number, assigned, assigned_to_profile_id")
          .in("policy_number", chunk);

        if (existingErr) {
          console.error("[failed-payment-fixes/sync] existing lookup error", existingErr);
          return res.status(500).json({ ok: false, error: "Failed to read existing records" });
        }

        for (const row of (existing ?? []) as Array<{
          policy_number: string;
          assigned: boolean;
          assigned_to_profile_id: string | null;
        }>) {
          if (typeof row.policy_number === "string") {
            existingByPolicyNumber.set(row.policy_number, {
              assigned: Boolean(row.assigned),
              assigned_to_profile_id: row.assigned_to_profile_id,
            });
          }
        }
      }
    }
    console.log("[failed-payment-fixes/sync] Existing records checked");

    // Get agency name from local mapping table
    const agencyCarrierIds = Array.from(
      new Set(
        allLeads
          .map((row) => row.agency_carrier_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    console.log("[failed-payment-fixes/sync] Agency carrier IDs:", agencyCarrierIds.length);

    const agencyNameByAgencyCarrierId = new Map<string, string>();
    if (agencyCarrierIds.length > 0) {
      console.log("[failed-payment-fixes/sync] Looking up agency names from local mapping...");
      const { data: localMappings } = await supabaseAdmin
        .from("agency_carrier_name_mapping")
        .select("agency_carrier_id, agency_name")
        .in("agency_carrier_id", agencyCarrierIds);

      console.log("[failed-payment-fixes/sync] Local mappings found:", localMappings?.length ?? 0);
      if (localMappings && localMappings.length > 0) {
        for (const mapping of localMappings as Array<{ agency_carrier_id: string; agency_name: string }>) {
          agencyNameByAgencyCarrierId.set(mapping.agency_carrier_id, mapping.agency_name);
        }
      }
    }

    console.log("[failed-payment-fixes/sync] Building payloads...");
    const nowIso = new Date().toISOString();
    let upserted = 0;
    let skipped = 0;

    const payloads: Array<Record<string, unknown>> = [];
    for (const row of allLeads) {
      if (!row.policy_number) {
        skipped += 1;
        continue;
      }

      const existing = existingByPolicyNumber.get(row.policy_number);

      const payload: Record<string, unknown> = {
        policy_number: row.policy_number,
        name: row.name,
        phone_number: row.phone_number,
        email: row.email,
        carrier: row.carrier,
        carrier_id: row.carrier_id,
        assigned_agency: row.agency_carrier_id ? agencyNameByAgencyCarrierId.get(row.agency_carrier_id) ?? null : null,
        policy_type: row.policy_type,
        policy_status: row.policy_status,
        carrier_status: row.carrier_status,
        ghl_name: row.ghl_name,
        ghl_stage: row.ghl_stage,
        deal_value: row.deal_value,
        cc_value: row.cc_value,
        charge_back: row.charge_back,
        deal_creation_date: row.deal_creation_date,
        effective_date: row.effective_date,
        commission_type: row.commission_type,
        writing_number: row.writing_number,
        cc_pmt_ws: row.cc_pmt_ws,
        cc_cb_ws: row.cc_cb_ws,
        status: row.status,
        tasks: row.tasks,
        notes: row.notes,
        call_center: row.call_center,
        sales_agent: row.sales_agent,
        failure_reason: row.failure_reason,
        failure_date: row.failure_date,
        retry_count: row.retry_count ?? 0,
        retry_scheduled_at: row.retry_scheduled_at,
        last_synced_at: nowIso,
        daily_deal_flow_fetched: true,
        daily_deal_flow_fetched_at: nowIso,
        source_policy_table: "deal_tracker",
        source_policy_id: row.id,
        source_deal_tracker_id: row.id,
      };

      if (existing) {
        payload.assigned = existing.assigned;
        payload.assigned_to_profile_id = existing.assigned_to_profile_id;
        payload.is_active = existing.assigned;
      } else {
        payload.assigned = false;
        payload.assigned_to_profile_id = null;
        payload.is_active = true;
      }

      payloads.push(payload);
    }

    console.log("[failed-payment-fixes/sync] Payloads built:", payloads.length);

    if (payloads.length > 0) {
      console.log("[failed-payment-fixes/sync] Starting upsert...");
      const CHUNK = 500;
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK);
        console.log("[failed-payment-fixes/sync] Upserting chunk:", chunk.length, "records");
        const { error: upsertErr } = await supabaseAdmin
          .from("failed_payment_fixes")
          .upsert(chunk, { onConflict: "policy_number", ignoreDuplicates: false });

        if (upsertErr) {
          console.error("[failed-payment-fixes/sync] upsert error", upsertErr);
          return res.status(500).json({ ok: false, error: `Upsert failed: ${upsertErr.message}` });
        }
        upserted += chunk.length;
      }
    }

    console.log("[failed-payment-fixes/sync] Sync complete:", { fetched: allLeads.length, upserted, skipped });

    return res.status(200).json({
      ok: true,
      fetched: allLeads.length,
      upserted,
      skipped,
      stages: [...TARGET_GHL_STAGES],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected sync error";
    console.error("[failed-payment-fixes/sync] fatal", error);
    return res.status(500).json({ ok: false, error: msg });
  }
}
