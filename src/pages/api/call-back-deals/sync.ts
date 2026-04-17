import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getSupabaseCrmAdmin } from "@/lib/supabase-crm";

const TARGET_STAGES = [
  "Incomplete Transfer",
  "Application Withdrawn",
  "Needs BPO Callback",
  "Declined Underwriting",
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

type CrmLeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  submission_id: string;
  stage: string | null;
  stage_id: number | null;
  call_center_id: string | null;
  lead_source: string | null;
};

function getBearerToken(req: NextApiRequest) {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
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
      console.error("[call-back-deals/sync] manager lookup error", managerErr);
      return res.status(500).json({ ok: false, error: "Failed to verify manager access" });
    }

    if (!managerRow?.id) {
      return res.status(403).json({ ok: false, error: "Only retention managers can sync callback deals" });
    }

    const crm = getSupabaseCrmAdmin();

    const PAGE_SIZE = 1000;
    const allLeads: CrmLeadRow[] = [];
    let offset = 0;

    // Paginate CRM leads by target stages.
    while (true) {
      const { data, error } = await crm
        .from("leads")
        .select(
          "id, first_name, last_name, phone, submission_id, stage, stage_id, call_center_id, lead_source",
        )
        .in("stage", [...TARGET_STAGES])
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error("[call-back-deals/sync] CRM fetch error", error);
        return res.status(500).json({ ok: false, error: `CRM fetch failed: ${error.message}` });
      }

      const batch = (data ?? []) as unknown as CrmLeadRow[];
      allLeads.push(...batch);

      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Resolve call-center names where possible.
    const callCenterIds = Array.from(
      new Set(
        allLeads
          .map((row) => (typeof row.call_center_id === "string" ? row.call_center_id.trim() : ""))
          .filter((v) => v.length > 0),
      ),
    );

    const callCenterNameById = new Map<string, string>();
    if (callCenterIds.length > 0) {
      const { data: centers, error: centersErr } = await crm
        .from("call_centers")
        .select("id, name")
        .in("id", callCenterIds);

      if (centersErr) {
        console.warn("[call-back-deals/sync] call_centers lookup failed (falling back to lead_source):", centersErr.message);
      } else {
        for (const row of (centers ?? []) as Array<{ id: string | null; name: string | null }>) {
          if (typeof row.id === "string" && typeof row.name === "string") {
            callCenterNameById.set(row.id, row.name);
          }
        }
      }
    }

    // Preload existing callback deals by submission_id so we preserve assignment fields
    // and only refresh source data / is_active for rows that aren't already TCPA-flagged.
    const submissionIds = Array.from(
      new Set(allLeads.map((row) => row.submission_id).filter((v): v is string => typeof v === "string" && v.length > 0)),
    );

    const existingBySubmission = new Map<string, { tcpa_flag: boolean }>();
    if (submissionIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < submissionIds.length; i += CHUNK) {
        const chunk = submissionIds.slice(i, i + CHUNK);
        const { data: existing, error: existingErr } = await supabaseAdmin
          .from("call_back_deals")
          .select("submission_id, tcpa_flag")
          .in("submission_id", chunk);

        if (existingErr) {
          console.error("[call-back-deals/sync] existing lookup error", existingErr);
          return res.status(500).json({ ok: false, error: "Failed to read existing callback deals" });
        }

        for (const row of (existing ?? []) as Array<{ submission_id: string; tcpa_flag: boolean }>) {
          if (typeof row.submission_id === "string") {
            existingBySubmission.set(row.submission_id, { tcpa_flag: Boolean(row.tcpa_flag) });
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    let upserted = 0;
    let skipped = 0;

    const payloads: Array<Record<string, unknown>> = [];
    for (const row of allLeads) {
      if (!row.submission_id) {
        skipped += 1;
        continue;
      }

      const first = typeof row.first_name === "string" ? row.first_name.trim() : "";
      const last = typeof row.last_name === "string" ? row.last_name.trim() : "";
      const name = [first, last].filter(Boolean).join(" ") || null;

      const callCenter =
        (typeof row.call_center_id === "string" && callCenterNameById.get(row.call_center_id)) ||
        (typeof row.lead_source === "string" && row.lead_source.trim().length > 0 ? row.lead_source.trim() : null);

      const existing = existingBySubmission.get(row.submission_id);
      // If row exists and has been TCPA flagged, keep is_active=false. Otherwise default true
      // but preserve the existing is_active value via onConflict update semantics.
      const payload: Record<string, unknown> = {
        submission_id: row.submission_id,
        name,
        phone_number: typeof row.phone === "string" ? row.phone : null,
        stage: typeof row.stage === "string" ? row.stage : null,
        stage_id: typeof row.stage_id === "number" ? row.stage_id : null,
        call_center: callCenter,
        crm_lead_id: typeof row.id === "string" ? row.id : null,
        last_synced_at: nowIso,
      };

      // Only overwrite is_active if not already TCPA-flagged.
      payload.is_active = existing?.tcpa_flag ? false : true;

      payloads.push(payload);
    }

    if (payloads.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK);
        const { error: upsertErr } = await supabaseAdmin
          .from("call_back_deals")
          .upsert(chunk, { onConflict: "submission_id", ignoreDuplicates: false });

        if (upsertErr) {
          console.error("[call-back-deals/sync] upsert error", upsertErr);
          return res.status(500).json({ ok: false, error: `Upsert failed: ${upsertErr.message}` });
        }
        upserted += chunk.length;
      }
    }

    return res.status(200).json({
      ok: true,
      fetched: allLeads.length,
      upserted,
      skipped,
      stages: [...TARGET_STAGES],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected sync error";
    console.error("[call-back-deals/sync] fatal", error);
    return res.status(500).json({ ok: false, error: msg });
  }
}
