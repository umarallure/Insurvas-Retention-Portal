import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";

type LeadRow = {
  id: string;
  submission_id: string | null;
  customer_full_name: string | null;
  social_security: string | null;
  created_at: string | null;
  [key: string]: unknown;
};

type LookupResponse =
  | {
      ok: true;
      failedPaymentFix: Record<string, unknown>;
      lead: Record<string, unknown> | null;
      matchedBy: "ghl_name" | "ssn" | "none";
      ssn: string | null;
      verificationItems: Array<{
        id: string;
        field_name: string;
        original_value: string | null;
        verified_value: string | null;
        is_verified: boolean;
      }>;
      submissionId: string | null;
    }
  | {
      ok: false;
      error: string;
    };

function getBearerToken(req: NextApiRequest) {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

function normalizeName(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickLatest<T extends { created_at: string | null }>(rows: T[]): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  })[0] ?? null;
}

function extractDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<LookupResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing Authorization Bearer token" });
  }

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return res.status(400).json({ ok: false, error: "id query param is required" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { data: fpf, error: fpfErr } = await supabaseAdmin
      .from("failed_payment_fixes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fpfErr) {
      console.error("[failed-payment-fixes/lookup-lead] lookup error", fpfErr);
      return res.status(500).json({ ok: false, error: fpfErr.message });
    }
    if (!fpf) {
      return res.status(404).json({ ok: false, error: "failed_payment_fixes row not found" });
    }

    const { data: viewerProfile, error: viewerProfileErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (viewerProfileErr || !viewerProfile?.id) {
      return res.status(403).json({ ok: false, error: "Profile not found" });
    }

    const { data: managerRow } = await supabaseAdmin
      .from("retention_managers")
      .select("id")
      .eq("profile_id", viewerProfile.id)
      .eq("active", true)
      .maybeSingle();

    const isManager = Boolean(managerRow);
    const viewerProfileId = String(viewerProfile.id).trim().toLowerCase();

    if (!isManager) {
      const assigneeRaw =
        typeof fpf.assigned_to_profile_id === "string" ? fpf.assigned_to_profile_id.trim().toLowerCase() : "";
      if (!assigneeRaw || assigneeRaw !== viewerProfileId) {
        return res.status(403).json({ ok: false, error: "You do not have access to this failed payment fix" });
      }
      if (fpf.is_active === false) {
        return res.status(403).json({ ok: false, error: "This failed payment fix is no longer active" });
      }
    }

    const ghlName = typeof fpf.ghl_name === "string" ? fpf.ghl_name.trim() : "";
    let matchedBy: "ghl_name" | "ssn" | "none" = "none";
    let foundLead: LeadRow | null = null;
    let ssn: string | null = null;
    let submissionId: string | null = null;
    let verificationItems: Array<{
      id: string;
      field_name: string;
      original_value: string | null;
      verified_value: string | null;
      is_verified: boolean;
    }> = [];

    if (ghlName) {
      const normalizedGhlName = normalizeName(ghlName);
      const { data: leadRows, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("id, submission_id, customer_full_name, social_security, created_at")
        .ilike("customer_full_name", `%${ghlName}%`)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (leadErr) {
        console.warn("[failed-payment-fixes/lookup-lead] name lookup failed:", leadErr.message);
      } else if (leadRows && leadRows.length > 0) {
        const rows = leadRows as LeadRow[];
        const wantedNorm = normalizeName(ghlName);
        const exactMatches = rows.filter(
          (r) => normalizeName(r.customer_full_name ?? "") === wantedNorm,
        );
        foundLead = pickLatest(exactMatches) ?? pickLatest(rows);
        if (foundLead) {
          matchedBy = "ghl_name";
          submissionId = foundLead.submission_id;
          ssn = extractDigits(foundLead.social_security);
        }
      }
    }

    if (!foundLead && ghlName) {
      const escaped = ghlName.replace(/,/g, "");
      const { data: leadRows, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("id, submission_id, customer_full_name, social_security, created_at")
        .ilike("customer_full_name", `%${escaped}%`)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (!leadErr && leadRows && leadRows.length > 0) {
        const rows = leadRows as LeadRow[];
        foundLead = pickLatest(rows);
        if (foundLead) {
          matchedBy = "ghl_name";
          submissionId = foundLead.submission_id;
          ssn = extractDigits(foundLead.social_security);
        }
      }
    }

    if (!ssn && foundLead) {
      ssn = extractDigits(foundLead.social_security);
    }

    if (!foundLead && ssn) {
      const { data: ssnRows, error: ssnErr } = await supabaseAdmin
        .from("leads")
        .select("id, submission_id, customer_full_name, social_security, created_at")
        .eq("social_security", ssn)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (!ssnErr && ssnRows && ssnRows.length > 0) {
        foundLead = pickLatest(ssnRows as LeadRow[]);
        if (foundLead) {
          matchedBy = "ssn";
          submissionId = foundLead.submission_id;
          ssn = extractDigits(foundLead.social_security);
        }
      }
    }

    if (submissionId) {
      const { data: sessionRows, error: sessionErr } = await supabaseAdmin
        .from("verification_sessions")
        .select("id")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sessionErr && sessionRows) {
        const { data: verificationRows, error: verificationErr } = await supabaseAdmin
          .from("verification_items")
          .select("id, field_name, original_value, verified_value, is_verified")
          .eq("session_id", (sessionRows as { id: string }).id)
          .order("field_name", { ascending: true });

        if (!verificationErr && verificationRows) {
          verificationItems = verificationRows.map(row => ({
            id: row.id,
            field_name: row.field_name,
            original_value: row.original_value,
            verified_value: row.verified_value,
            is_verified: row.is_verified,
          }));
        }
      }
    }

    const leadData = foundLead ? { ...foundLead } : null;

    return res.status(200).json({
      ok: true,
      failedPaymentFix: fpf as Record<string, unknown>,
      lead: leadData as Record<string, unknown> | null,
      matchedBy,
      ssn,
      verificationItems,
      submissionId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lookup failed";
    console.error("[failed-payment-fixes/lookup-lead] fatal", error);
    return res.status(500).json({ ok: false, error: msg });
  }
}