import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";
import XLSX from "xlsx";
import crypto from "crypto";

type UploadResponse =
  | {
      ok: true;
      inserted: number;
      skipped: number;
      errors: string[];
    }
  | {
      ok: false;
      error: string;
    };

const EXPECTED_COLUMNS = ["NAME", "LAST NAME", "PHONE", "MED ID"];

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<UploadResponse>) {
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
      return res.status(403).json({ ok: false, error: "Only retention managers can upload leads" });
    }

    const { file } = req.body as { file?: string; fileName?: string };
    if (!file || typeof file !== "string") {
      return res.status(400).json({ ok: false, error: "No file data provided" });
    }

    const buffer = Buffer.from(file, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ ok: false, error: "Excel file has no sheets" });
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });

    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: "Excel file has no data rows" });
    }

    const nowIso = new Date().toISOString();
    const errors: string[] = [];
    let inserted = 0;
    let skipped = 0;

    const CHUNK = 200;
    const payloads: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const firstName = String(row["NAME"] ?? "").trim();
      const lastName = String(row["LAST NAME"] ?? "").trim();
      const phoneRaw = String(row["PHONE"] ?? "").replace(/\D/g, "");

      if (!phoneRaw) {
        skipped++;
        errors.push(`Row ${rows.indexOf(row) + 2}: No phone number`);
        continue;
      }

      if (phoneRaw.length < 10) {
        skipped++;
        errors.push(`Row ${rows.indexOf(row) + 2}: Invalid phone "${phoneRaw}"`);
        continue;
      }

      const name = [firstName, lastName].filter(Boolean).join(" ") || null;
      const submissionId = crypto.randomUUID();

      payloads.push({
        submission_id: submissionId,
        name,
        phone_number: phoneRaw,
        stage: "Internal-Leads-Never-Called",
        call_center: "Retention BPO",
        is_active: true,
        assigned: false,
        assigned_to_profile_id: null,
        assigned_by_profile_id: null,
        assigned_at: null,
        last_synced_at: nowIso,
      });
    }

    if (payloads.length > 0) {
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK);
        const { error: upsertErr } = await supabaseAdmin
          .from("call_back_deals")
          .insert(chunk);

        if (upsertErr) {
          errors.push(`Insert error at chunk ${i / CHUNK + 1}: ${upsertErr.message}`);
          break;
        }
        inserted += chunk.length;
      }
    }

    return res.status(200).json({
      ok: true,
      inserted,
      skipped,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Upload error";
    console.error("[call-back-deals/upload-leads] fatal", error);
    return res.status(500).json({ ok: false, error: msg });
  }
}