import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getSupabaseCrmAdmin } from "@/lib/supabase-crm";

type LeadRow = {
  id: string;
  submission_id: string | null;
  customer_full_name: string | null;
  social_security: string | null;
  phone_number: string | null;
  carrier: string | null;
  product_type: string | null;
  lead_vendor: string | null;
  date_of_birth: string | null;
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

// Maps CRM leads table column names to the main-DB / verification field names.
const CRM_COLUMN_MAP: Record<string, string> = {
  first_name: "first_name",       // combined with last_name → customer_full_name (handled separately)
  last_name: "last_name",
  phone: "phone_number",
  lead_source: "lead_vendor",
  social: "social_security",
  date_of_birth: "date_of_birth",
  bank_account_type: "account_type",
  institution_name: "institution_name",
  routing_number: "beneficiary_routing",
  account_number: "beneficiary_account",
  monthly_premium: "monthly_premium",
  coverage_amount: "coverage_amount",
  policy_id: "policy_number",
  call_center_id: "call_center_id",
  stage: "stage",
  stage_id: "stage_id",
  carrier: "carrier",
  product_type: "product_type",
  driver_license_number: "driver_license",
  existing_coverage_last_2_years: "existing_coverage",
  previous_applications_2_years: "applied_to_life_insurance_last_two_years",
  doctor_name: "doctors_name",
  tobacco_use: "tobacco_use",
  health_conditions: "health_conditions",
  medications: "medications",
  height: "height",
  weight: "weight",
  additional_information: "additional_notes",
  beneficiary_information: "beneficiary_information",
  email: "email",
  birth_state: "birth_state",
  age: "age",
  draft_date: "draft_date",
  future_draft_date: "future_draft_date",
  lead_vendor: "lead_vendor",
};

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

    console.log("[lookup-lead] fpf row:", { id: fpf.id, ghlName, ghlStage: fpf.ghl_stage, name: fpf.name });

    if (ghlName) {
      const normalizedGhlName = normalizeName(ghlName);
      const { data: leadRows, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("*")
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
        .select("*")
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
        .select("*")
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

    // CRM lead lookup by policy_number (what the CRM Notes panel uses)
    if (!foundLead) {
      const policyNumber = typeof fpf.policy_number === "string" ? fpf.policy_number.trim() : "";
      if (policyNumber) {
        console.log("[lookup-lead] trying CRM leads table by policy_id:", policyNumber);
        try {
          const crm = getSupabaseCrmAdmin();
          const { data: crmLead, error: crmErr } = await crm
            .from("leads")
            .select("*")
            .eq("policy_id", policyNumber)
            .maybeSingle();

          if (crmErr) {
            console.warn("[lookup-lead] CRM lookup error:", crmErr.message);
          } else if (crmLead) {
            console.log("[lookup-lead] found CRM lead, all keys:", Object.keys(crmLead), "values:", JSON.stringify(crmLead));
            const firstName = typeof crmLead.first_name === "string" ? crmLead.first_name.trim() : "";
            const lastName = typeof crmLead.last_name === "string" ? crmLead.last_name.trim() : "";
            const fullName = [firstName, lastName].filter(Boolean).join(" ");

            // Start with ALL raw CRM fields so any column that already matches
            // a verification field name passes through automatically.
            const base: Record<string, unknown> = { ...(crmLead as Record<string, unknown>) };
            base.id = String(crmLead.id);
            base.customer_full_name = fullName || null;
            base.submission_id = typeof crmLead.submission_id === "string" ? crmLead.submission_id : null;
            base.created_at = typeof crmLead.created_at === "string" ? crmLead.created_at : null;

            // Apply CRM→verification field name mapping so columns like
            // social→social_security, phone→phone_number, street1→street_address,
            // etc. all populate correctly.
            for (const [crmCol, mappedName] of Object.entries(CRM_COLUMN_MAP)) {
              if (mappedName === "first_name" || mappedName === "last_name") continue; // handled above
              const val = (crmLead as Record<string, unknown>)[crmCol];
              if (val != null && String(val).trim().length > 0) {
                if (base[mappedName] == null || String(base[mappedName]).trim().length === 0) {
                  base[mappedName] = String(val).trim();
                }
              }
            }

            // Combine street1 + street2 → street_address
            const street1 = typeof crmLead.street1 === "string" ? crmLead.street1.trim() : "";
            const street2 = typeof crmLead.street2 === "string" ? crmLead.street2.trim() : "";
            const combined = [street1, street2].filter(Boolean).join(", ");
            if (combined) base.street_address = combined;

            foundLead = base as unknown as LeadRow;
            matchedBy = "ghl_name";
            submissionId = foundLead.submission_id;
          }
        } catch (crmErr) {
          console.warn("[lookup-lead] CRM lookup threw:", crmErr);
        }
      } else {
        console.log("[lookup-lead] fpf has no policy_number, skipping CRM lookup");
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

    console.log("[lookup-lead] returning:", {
      matchedBy,
      hasLead: !!leadData,
      leadKeys: leadData ? Object.keys(leadData) : [],
      verificationItemCount: verificationItems.length,
      submissionId,
    });

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