import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSupabaseCrmAdmin } from "@/lib/supabase-crm";
import XLSX from "xlsx";

type SyncCsvResponse =
  | {
      ok: true;
      matched: number;
      fetched: number;
      notFound: number;
      total: number;
      errors: string[];
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

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<SyncCsvResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = (() => {
    const h = req.headers.authorization;
    if (!h) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h);
    return m?.[1] ?? null;
  })();

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

    const { data: managerRow } = await supabaseAdmin
      .from("retention_managers")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("active", true)
      .maybeSingle();

    if (!managerRow?.id) {
      return res.status(403).json({ ok: false, error: "Only retention managers can sync CSV deals" });
    }

    const { file } = req.body as { file?: string; fileName?: string };
    if (!file || typeof file !== "string") {
      return res.status(400).json({ ok: false, error: "No file data provided" });
    }

    const buffer = Buffer.from(file, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ ok: false, error: "File has no sheets" });
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });

    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: "File has no data rows" });
    }

    const submissionIds = new Set<string>();
    const errors: string[] = [];

    for (const row of rows) {
      const values = Object.values(row).filter((v) => typeof v === "string" && v.trim().length > 0);
      if (values.length === 0) {
        errors.push(`Row ${rows.indexOf(row) + 2}: No data found`);
        continue;
      }
      const subId = values[0]!.toString().trim();
      if (!subId) continue;
      submissionIds.add(subId);
    }

    if (submissionIds.size === 0) {
      return res.status(400).json({ ok: false, error: "No submission IDs found in file" });
    }

    const ids = Array.from(submissionIds);
    const CHUNK = 500;
    const nowIso = new Date().toISOString();

    // Step 1: Check which submission_ids already exist in call_back_deals
    const existingSubmissionIds = new Set<string>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data: existing, error: existingErr } = await supabaseAdmin
        .from("call_back_deals")
        .select("submission_id")
        .in("submission_id", chunk);

      if (existingErr) {
        console.error("[call-back-deals/sync-csv] existing lookup error", existingErr);
        return res.status(500).json({ ok: false, error: `Failed to check existing deals: ${existingErr.message}` });
      }

      for (const row of (existing ?? []) as Array<{ submission_id: string }>) {
        if (typeof row.submission_id === "string") {
          existingSubmissionIds.add(row.submission_id);
        }
      }
    }

    // Step 2: Tag existing leads as prioritized
    const existingIds = Array.from(existingSubmissionIds);
    if (existingIds.length > 0) {
      for (let i = 0; i < existingIds.length; i += CHUNK) {
        const chunk = existingIds.slice(i, i + CHUNK);
        const { error: updateErr } = await supabaseAdmin
          .from("call_back_deals")
          .update({
            is_prioritized: true,
            last_synced_at: nowIso,
          })
          .in("submission_id", chunk);

        if (updateErr) {
          console.error("[call-back-deals/sync-csv] update error", updateErr);
          errors.push(`Failed to tag existing rows as prioritized: ${updateErr.message}`);
        }
      }
    }

    // Step 3: Find missing submission_ids and fetch from CRM
    const crm = getSupabaseCrmAdmin();
    const missingIds = ids.filter((id) => !existingSubmissionIds.has(id));

    // Step 4: Fetch missing leads from CRM by submission_id
    const crmLeads: CrmLeadRow[] = [];
    for (let i = 0; i < missingIds.length; i += CHUNK) {
      const chunk = missingIds.slice(i, i + CHUNK);
      const { data, error: crmErr } = await crm
        .from("leads")
        .select("id, first_name, last_name, phone, submission_id, stage, stage_id, call_center_id, lead_source")
        .in("submission_id", chunk);

      if (crmErr) {
        console.error("[call-back-deals/sync-csv] CRM fetch error", crmErr);
        errors.push(`CRM fetch failed for chunk ${i / CHUNK + 1}: ${crmErr.message}`);
        continue;
      }

      crmLeads.push(...((data ?? []) as unknown as CrmLeadRow[]));
    }

    // Step 5: Build upsert payloads for CRM leads found
    const crmFoundBySub = new Map<string, CrmLeadRow>();
    for (const lead of crmLeads) {
      if (lead.submission_id) {
        crmFoundBySub.set(lead.submission_id, lead);
      }
    }

    // Resolve call center names
    const callCenterIds = Array.from(
      new Set(
        crmLeads
          .map((row) => (typeof row.call_center_id === "string" ? row.call_center_id.trim() : ""))
          .filter((v) => v.length > 0),
      ),
    );

    const callCenterNameById = new Map<string, string>();
    if (callCenterIds.length > 0) {
      const { data: centers } = await crm
        .from("call_centers")
        .select("id, name")
        .in("id", callCenterIds);

      if (centers) {
        for (const row of (centers as Array<{ id: string | null; name: string | null }>)) {
          if (typeof row.id === "string" && typeof row.name === "string") {
            callCenterNameById.set(row.id, row.name);
          }
        }
      }
    }

    const payloads: Array<Record<string, unknown>> = [];
    const notFoundIds: string[] = [];

    for (const submissionId of missingIds) {
      const crmLead = crmFoundBySub.get(submissionId);
      if (!crmLead) {
        notFoundIds.push(submissionId);
        continue;
      }

      const first = typeof crmLead.first_name === "string" ? crmLead.first_name.trim() : "";
      const last = typeof crmLead.last_name === "string" ? crmLead.last_name.trim() : "";
      const name = [first, last].filter(Boolean).join(" ") || null;

      const callCenter =
        (typeof crmLead.call_center_id === "string" && callCenterNameById.get(crmLead.call_center_id)) ||
        (typeof crmLead.lead_source === "string" && crmLead.lead_source.trim().length > 0 ? crmLead.lead_source.trim() : null);

      payloads.push({
        submission_id: submissionId,
        name,
        phone_number: typeof crmLead.phone === "string" ? crmLead.phone : null,
        stage: typeof crmLead.stage === "string" ? crmLead.stage : null,
        stage_id: typeof crmLead.stage_id === "number" ? crmLead.stage_id : null,
        call_center: callCenter,
        crm_lead_id: typeof crmLead.id === "string" ? crmLead.id : null,
        is_prioritized: true,
        is_active: true,
        assigned: false,
        last_synced_at: nowIso,
      });
    }

    // Step 6: Upsert new leads
    let fetched = 0;
    if (payloads.length > 0) {
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK);
        const { error: upsertErr } = await supabaseAdmin
          .from("call_back_deals")
          .upsert(chunk, { onConflict: "submission_id", ignoreDuplicates: false });

        if (upsertErr) {
          console.error("[call-back-deals/sync-csv] upsert error", upsertErr);
          errors.push(`Upsert error at chunk ${i / CHUNK + 1}: ${upsertErr.message}`);
          continue;
        }
        fetched += chunk.length;
      }
    }

    return res.status(200).json({
      ok: true,
      matched: existingIds.length,
      fetched,
      notFound: notFoundIds.length,
      total: ids.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected sync-csv error";
    console.error("[call-back-deals/sync-csv] fatal", error);
    return res.status(500).json({ ok: false, error: msg });
  }
}
