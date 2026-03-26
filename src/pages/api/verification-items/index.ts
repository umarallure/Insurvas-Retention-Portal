import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";

import { getSupabaseAdmin } from "@/lib/supabase";
import { sortVerificationItems } from "@/lib/verification-field-order";

type Body = {
  leadId?: string;
  dealId?: number;
  policyKey: string;
  callCenter?: string | null;
  autofill?: Record<string, string>;
  createWhenNoMatch?: boolean;
  missingLeadNote?: string;
};

type ResponseData =
  | {
      ok: true;
      sessionId: string;
      items: Array<Record<string, unknown>>;
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

type LeadCandidateRow = {
  id: string;
  submission_id: string | null;
  customer_full_name: string | null;
  phone_number: string | null;
  lead_vendor: string | null;
  created_at: string | null;
};

function normalizeName(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhoneDigits(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function last10Digits(value: string | null | undefined) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function buildDigitWildcardPattern(digits: string) {
  const clean = digits.replace(/\D/g, "");
  if (!clean.length) return null;
  return `%${clean.split("").join("%")}%`;
}

function normalizeVendorForMatch(vendor: string | null | undefined) {
  if (!vendor) return "";
  return vendor
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b[a-z]*bpo\b/g, "bpo")
    .replace(/\s+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

const DEFAULT_MISSING_LEAD_NOTE = "this lead was not available need to confirm with client";

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing Authorization Bearer token" });
  }

  const body = (req.body ?? {}) as Partial<Body>;
  const leadIdRaw = typeof body.leadId === "string" ? body.leadId.trim() : "";
  const dealId = typeof body.dealId === "number" && Number.isFinite(body.dealId) ? body.dealId : null;
  const policyKey = typeof body.policyKey === "string" ? body.policyKey.trim() : "";
  const callCenter = typeof body.callCenter === "string" ? body.callCenter.trim() : null;
  const autofill = body.autofill && typeof body.autofill === "object" ? (body.autofill as Record<string, string>) : {};
  const createWhenNoMatch = body.createWhenNoMatch === true;
  const missingLeadNote =
    typeof body.missingLeadNote === "string" && body.missingLeadNote.trim().length > 0
      ? body.missingLeadNote.trim()
      : DEFAULT_MISSING_LEAD_NOTE;
  const effectiveAutofill: Record<string, string> = { ...autofill };
  if (createWhenNoMatch && !effectiveAutofill.additional_notes?.trim()) {
    effectiveAutofill.additional_notes = missingLeadNote;
  }

  if (!policyKey) {
    return res.status(400).json({ ok: false, error: "policyKey is required" });
  }

  if (!leadIdRaw && dealId == null) {
    return res.status(400).json({ ok: false, error: "leadId or dealId is required" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    console.log("[verification-items] incoming context", {
      userId: userData.user.id,
      leadIdRaw: leadIdRaw || null,
      dealId,
      policyKey,
      callCenter,
    });

    let leadId = leadIdRaw;
    let submissionId = "";

    if (dealId != null) {
      const { data: dealRow, error: dealErr } = await supabaseAdmin
        .from("monday_com_deals")
        .select("id, monday_item_id, ghl_name, deal_name, phone_number, call_center")
        .eq("id", dealId)
        .maybeSingle();

      if (dealErr) {
        return res.status(500).json({ ok: false, error: dealErr.message });
      }

      if (!dealRow) {
        return res.status(404).json({ ok: false, error: "Monday deal not found" });
      }

      const mondayName =
        (typeof dealRow.ghl_name === "string" && dealRow.ghl_name.trim().length ? dealRow.ghl_name.trim() : "") ||
        (typeof dealRow.deal_name === "string" && dealRow.deal_name.trim().length ? dealRow.deal_name.trim() : "") ||
        "";
      const mondayNameNorm = normalizeName(mondayName);
      const mondayPhone10 = last10Digits(typeof dealRow.phone_number === "string" ? dealRow.phone_number : "");
      const mondayVendorNorm = normalizeVendorForMatch(typeof dealRow.call_center === "string" ? dealRow.call_center : "");

      console.log("[verification-items] monday row", {
        dealId: dealRow.id,
        mondayItemId: dealRow.monday_item_id,
        mondayName,
        mondayPhone: dealRow.phone_number,
        mondayPhone10,
        callCenter: dealRow.call_center,
        mondayVendorNorm,
        createWhenNoMatch,
      });

      const orParts: string[] = [];
      if (mondayName) {
        const escapedName = mondayName.replace(/,/g, "");
        orParts.push(`customer_full_name.ilike.%${escapedName}%`);
      }
      if (mondayPhone10) {
        const phonePattern = buildDigitWildcardPattern(mondayPhone10);
        if (phonePattern) {
          orParts.push(`phone_number.ilike.${phonePattern}`);
        }
      }

      let leadQuery = supabaseAdmin
        .from("leads")
        .select("id, submission_id, customer_full_name, phone_number, lead_vendor, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (orParts.length > 0) {
        leadQuery = leadQuery.or(orParts.join(","));
      }

      const { data: leadCandidatesRaw, error: leadCandidatesErr } = await leadQuery;
      if (leadCandidatesErr) {
        return res.status(500).json({ ok: false, error: leadCandidatesErr.message });
      }

      const leadCandidates = (leadCandidatesRaw ?? []) as LeadCandidateRow[];

      const scored = leadCandidates.map((candidate) => {
        const candidateNameNorm = normalizeName(candidate.customer_full_name);
        const candidatePhone10 = last10Digits(candidate.phone_number);
        const candidateVendorNorm = normalizeVendorForMatch(candidate.lead_vendor);
        const nameExact = !!mondayNameNorm && candidateNameNorm === mondayNameNorm;
        const phoneExact = !!mondayPhone10 && !!candidatePhone10 && candidatePhone10 === mondayPhone10;
        const vendorMatch =
          !!mondayVendorNorm &&
          !!candidateVendorNorm &&
          (mondayVendorNorm === candidateVendorNorm ||
            mondayVendorNorm.includes(candidateVendorNorm) ||
            candidateVendorNorm.includes(mondayVendorNorm));
        const createdAtScore = Date.parse(candidate.created_at ?? "") || 0;

        return {
          candidate,
          nameExact,
          phoneExact,
          vendorMatch,
          createdAtScore,
        };
      });

      const nameExactPool = scored.filter((s) => s.nameExact);
      const pool = nameExactPool.length > 0 ? nameExactPool : scored;

      pool.sort((a, b) => {
        if (Number(b.nameExact) !== Number(a.nameExact)) return Number(b.nameExact) - Number(a.nameExact);
        if (Number(b.phoneExact) !== Number(a.phoneExact)) return Number(b.phoneExact) - Number(a.phoneExact);
        if (Number(b.vendorMatch) !== Number(a.vendorMatch)) return Number(b.vendorMatch) - Number(a.vendorMatch);
        return b.createdAtScore - a.createdAtScore;
      });

      const picked = pool[0] ?? null;

      console.log("[verification-items] lead matching summary", {
        candidateCount: leadCandidates.length,
        exactNameCount: nameExactPool.length,
        topCandidates: pool.slice(0, 5).map((p) => ({
          leadId: p.candidate.id,
          submissionId: p.candidate.submission_id,
          customerName: p.candidate.customer_full_name,
          phone: p.candidate.phone_number,
          vendor: p.candidate.lead_vendor,
          nameExact: p.nameExact,
          phoneExact: p.phoneExact,
          vendorMatch: p.vendorMatch,
          createdAt: p.candidate.created_at,
        })),
      });

      if (!picked) {
        if (!createWhenNoMatch) {
          return res.status(404).json({ ok: false, error: "No matching lead found for this deal" });
        }

        const generatedSubmissionId = randomUUID();
        const leadVendor =
          callCenter && callCenter.length
            ? callCenter
            : typeof dealRow.call_center === "string" && dealRow.call_center.trim().length
              ? dealRow.call_center.trim()
              : null;
        const { data: insertedLead, error: insertLeadErr } = await supabaseAdmin
          .from("leads")
          .insert({
            submission_id: generatedSubmissionId,
            customer_full_name: mondayName || null,
            phone_number: typeof dealRow.phone_number === "string" ? dealRow.phone_number : null,
            lead_vendor: leadVendor,
          })
          .select("id, submission_id")
          .maybeSingle();

        if (insertLeadErr) {
          return res.status(500).json({ ok: false, error: insertLeadErr.message });
        }

        leadId =
          insertedLead &&
          typeof insertedLead === "object" &&
          "id" in insertedLead &&
          typeof insertedLead.id === "string"
            ? insertedLead.id
            : "";
        submissionId =
          insertedLead &&
          typeof insertedLead === "object" &&
          "submission_id" in insertedLead &&
          typeof insertedLead.submission_id === "string"
            ? insertedLead.submission_id.trim()
            : generatedSubmissionId;

        console.log("[verification-items] created fallback lead for deal", {
          dealId: dealRow.id,
          leadId,
          submissionId,
        });
      } else {
        leadId = picked.candidate.id;
        submissionId = typeof picked.candidate.submission_id === "string" ? picked.candidate.submission_id.trim() : "";
      }
    }

    if (!leadId) {
      return res.status(400).json({ ok: false, error: "leadId or dealId is required" });
    }

    if (!submissionId) {
      const { data: leadRow } = await supabaseAdmin
        .from("leads")
        .select("submission_id")
        .eq("id", leadId)
        .maybeSingle();

      submissionId =
        leadRow &&
        typeof leadRow === "object" &&
        leadRow !== null &&
        "submission_id" in leadRow &&
        typeof leadRow["submission_id"] === "string"
          ? leadRow["submission_id"].trim()
          : "";
    }

    console.log("[verification-items] resolved lead/submission", {
      leadId,
      submissionId: submissionId || null,
      source: dealId != null ? "deal_matching" : "lead_id",
    });

    if (!submissionId) {
      return res.status(400).json({ ok: false, error: "Lead is missing submission_id" });
    }

    const { data: existingSession, error: existingSessionErr } = await supabaseAdmin
      .from("verification_sessions")
      .select("*")
      .eq("submission_id", submissionId)
      .in("status", ["pending", "in_progress", "ready_for_transfer", "transferred", "completed"])
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (existingSessionErr) {
      return res.status(500).json({ ok: false, error: existingSessionErr.message });
    }

    let session = (existingSession ?? null) as Record<string, unknown> | null;
    let sessionId = session && typeof session["id"] === "string" ? (session["id"] as string) : "";

    console.log("[verification-items] session lookup", {
      submissionId,
      foundSessionId: sessionId || null,
      foundSessionStatus: session && typeof session["status"] === "string" ? (session["status"] as string) : null,
      foundSessionCreatedAt:
        session && typeof session["created_at"] === "string" ? (session["created_at"] as string) : null,
    });

    if (!sessionId) {
      const sessionInsert: Record<string, unknown> = {
        submission_id: submissionId,
        status: "in_progress",
        is_retention_call: true,
      };

      const { data: insertedSession, error: insertSessionErr } = await supabaseAdmin
        .from("verification_sessions")
        .insert(sessionInsert)
        .select("*")
        .maybeSingle();

      if (insertSessionErr) {
        return res.status(500).json({ ok: false, error: insertSessionErr.message });
      }

      session = (insertedSession ?? null) as Record<string, unknown> | null;
      sessionId = session && typeof session["id"] === "string" ? (session["id"] as string) : "";

      console.log("[verification-items] session created", {
        submissionId,
        sessionId: sessionId || null,
      });
    }

    if (!sessionId) {
      return res.status(500).json({ ok: false, error: "Failed to create or load verification session" });
    }

    if (leadId && effectiveAutofill && Object.keys(effectiveAutofill).length > 0) {
      const leadUpdatePatch: Record<string, unknown> = {};
      
      // Only map fields that actually exist in the leads table
      // Note: policy_number does NOT exist in leads table - it's policy-specific and stored in daily_deal_flow/monday_com_deals
      // agent and product_type DO exist in leads table, but they're lead-level fields, not policy-specific
      const fieldMappings: Record<string, string> = {
        customer_full_name: "customer_full_name",
        phone_number: "phone_number",
        email: "email",
        street_address: "street_address",
        city: "city",
        state: "state",
        zip_code: "zip_code",
        date_of_birth: "date_of_birth",
        social_security: "social_security",
        carrier: "carrier",
        product_type: "product_type", // Exists in leads table (lead-level, not policy-specific)
        monthly_premium: "monthly_premium",
        agent: "agent", // Exists in leads table (lead-level, not policy-specific)
        lead_vendor: "lead_vendor",
        beneficiary_information: "beneficiary_information",
        billing_and_mailing_address_is_the_same: "billing_and_mailing_address_is_the_same",
        age: "age",
        driver_license: "driver_license",
        exp: "exp",
        existing_coverage: "existing_coverage",
        applied_to_life_insurance_last_two_years: "applied_to_life_insurance_last_two_years",
        height: "height",
        weight: "weight",
        doctors_name: "doctors_name",
        tobacco_use: "tobacco_use",
        health_conditions: "health_conditions",
        medications: "medications",
        insurance_application_details: "insurance_application_details",
        coverage_amount: "coverage_amount",
        draft_date: "draft_date",
        first_draft: "first_draft",
        institution_name: "institution_name",
        beneficiary_routing: "beneficiary_routing",
        beneficiary_account: "beneficiary_account",
        account_type: "account_type",
        birth_state: "birth_state",
        call_phone_landline: "call_phone_landline",
        additional_notes: "additional_notes",
        // Note: policy_number is NOT in leads table - it's policy-specific and stored per-policy in daily_deal_flow/monday_com_deals
        // Each policy has its own verification session, so multiple policies are handled separately
      };

      for (const [autofillKey, leadColumn] of Object.entries(fieldMappings)) {
        const value = effectiveAutofill[autofillKey];
        if (value && typeof value === "string" && value.trim().length > 0 && value !== "—") {
          leadUpdatePatch[leadColumn] = value.trim();
        }
      }

      if (Object.keys(leadUpdatePatch).length > 0) {
        const { error: leadUpdateErr } = await supabaseAdmin
          .from("leads")
          .update(leadUpdatePatch)
          .eq("id", leadId);

        if (leadUpdateErr) {
          console.error("[verification-items] Failed to update lead with merged data:", leadUpdateErr);
        }
      }
    }

    const { data: itemsRows, error: itemsErr } = await supabaseAdmin
      .from("verification_items")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (itemsErr) {
      return res.status(500).json({ ok: false, error: itemsErr.message });
    }

    const initial = (itemsRows ?? []) as Array<Record<string, unknown>>;

    if (effectiveAutofill && Object.keys(effectiveAutofill).length > 0) {
      if (initial.length === 0) {
        const fieldNames = Object.keys(effectiveAutofill).filter((k) => k.trim().length);
        if (fieldNames.length) {
          const inserts = fieldNames.map((fieldName) => ({
            session_id: sessionId,
            field_name: fieldName,
            original_value: (effectiveAutofill[fieldName] ?? "").toString(),
          }));

          const { error: seedErr } = await supabaseAdmin.from("verification_items").insert(inserts);
          if (seedErr) {
            console.error("[verification-items] Failed to create verification items:", seedErr);
            return res.status(500).json({ ok: false, error: seedErr.message });
          }
        }
      } else {
        for (const item of initial) {
          const itemId = typeof item.id === "string" ? item.id : null;
          const fieldName = typeof item.field_name === "string" ? item.field_name : null;
          const currentOriginal = typeof item.original_value === "string" ? item.original_value : "";
          
          if (!itemId || !fieldName) continue;
          
          const autofillValue = effectiveAutofill[fieldName];
          if (autofillValue && typeof autofillValue === "string" && autofillValue.trim().length > 0) {
            // For monthly_premium and coverage_amount, always update with autofill value because these should match
            // what the policy card displays, even if original_value already exists. This ensures consistency.
            const shouldUpdate = fieldName === "monthly_premium" || fieldName === "coverage_amount" || !currentOriginal || currentOriginal.trim().length === 0;
            
            if (shouldUpdate) {
              const { error: updateErr } = await supabaseAdmin
                .from("verification_items")
                .update({ original_value: autofillValue })
                .eq("id", itemId);
              
              if (updateErr) {
                console.error(`[verification-items] Failed to update item ${itemId}:`, updateErr);
              } else if (fieldName === "monthly_premium" || fieldName === "coverage_amount") {
                console.log(`[verification-items] Updated ${fieldName} from ${currentOriginal} to ${autofillValue} for item ${itemId}`);
              }
            }
          }
        }
      }
    }

    const { data: itemsRows2, error: itemsErr2 } = await supabaseAdmin
      .from("verification_items")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (itemsErr2) {
      return res.status(500).json({ ok: false, error: itemsErr2.message });
    }

    const finalItems = sortVerificationItems((itemsRows2 ?? []) as Array<Record<string, unknown>>);
    console.log("[verification-items] final response", {
      leadId,
      submissionId,
      sessionId,
      itemCount: finalItems.length,
    });
    return res.status(200).json({ ok: true, sessionId, items: finalItems });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load verification items";
    return res.status(500).json({ ok: false, error: msg });
  }
}
