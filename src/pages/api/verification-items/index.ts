import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";

type Body = {
  leadId?: string;
  dealId?: number;
  policyKey: string;
  callCenter?: string | null;
  autofill?: Record<string, string>;
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

    let leadId = leadIdRaw;
    if (!leadId) {
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

      const submissionId = typeof dealRow.monday_item_id === "string" ? dealRow.monday_item_id.trim() : "";
      const customerName =
        (typeof dealRow.ghl_name === "string" && dealRow.ghl_name.trim().length ? dealRow.ghl_name.trim() : "") ||
        (typeof dealRow.deal_name === "string" && dealRow.deal_name.trim().length ? dealRow.deal_name.trim() : "") ||
        "";
      const phone = typeof dealRow.phone_number === "string" ? dealRow.phone_number.trim() : "";
      const vendor = typeof dealRow.call_center === "string" ? dealRow.call_center.trim() : "";

      const shadowLead = {
        submission_id: submissionId || null,
        customer_full_name: customerName || null,
        phone_number: phone || null,
        lead_vendor: vendor || null,
      } as Record<string, unknown>;

      // If we have a submission_id, try to re-use an existing leads row first.
      if (submissionId) {
        const { data: existingLead, error: existingErr } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("submission_id", submissionId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingErr) {
          return res.status(500).json({ ok: false, error: existingErr.message });
        }

        const existingId =
          existingLead && typeof existingLead === "object" && existingLead !== null && "id" in existingLead
            ? (existingLead["id"] as unknown)
            : null;
        const existingIdStr = typeof existingId === "string" ? existingId : "";
        if (existingIdStr) {
          leadId = existingIdStr;
        }
      }

      if (!leadId) {
        const insertOrUpsert = async () => {
          if (submissionId) {
            return supabaseAdmin
              .from("leads")
              .upsert(shadowLead, { onConflict: "submission_id" })
              .select("id")
              .maybeSingle();
          }

          return supabaseAdmin.from("leads").insert(shadowLead).select("id").maybeSingle();
        };

        const { data: insertedLead, error: insertErr } = await insertOrUpsert();

        if (insertErr) {
          // If a race caused a unique violation, retry reading the existing lead by submission_id.
          if (submissionId) {
            const { data: existingLead2, error: existingErr2 } = await supabaseAdmin
              .from("leads")
              .select("id")
              .eq("submission_id", submissionId)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingErr2) {
              return res.status(500).json({ ok: false, error: existingErr2.message });
            }

            const existingId2 =
              existingLead2 && typeof existingLead2 === "object" && existingLead2 !== null && "id" in existingLead2
                ? (existingLead2["id"] as unknown)
                : null;
            const existingId2Str = typeof existingId2 === "string" ? existingId2 : "";
            if (existingId2Str) {
              leadId = existingId2Str;
            } else {
              return res.status(500).json({ ok: false, error: insertErr.message });
            }
          } else {
            return res.status(500).json({ ok: false, error: insertErr.message });
          }
        }

        if (!leadId) {
          const insertedId =
            insertedLead && typeof insertedLead === "object" && insertedLead !== null && "id" in insertedLead
              ? (insertedLead["id"] as unknown)
              : null;
          leadId = typeof insertedId === "string" ? insertedId : "";
        }
      }

      if (!leadId) {
        return res.status(500).json({ ok: false, error: "Failed to create shadow lead" });
      }
    }

    const { data: sessionRow, error: sessionErr } = await supabaseAdmin.rpc(
      "retention_get_or_create_verification_session",
      {
        lead_id_param: leadId,
        policy_number_param: policyKey,
        call_center_param: callCenter,
      },
    );

    if (sessionErr) {
      return res.status(500).json({ ok: false, error: sessionErr.message });
    }

    const session = sessionRow as unknown as Record<string, unknown> | null;
    const sessionId = session && typeof session["id"] === "string" ? (session["id"] as string) : "";
    if (!sessionId) {
      return res.status(500).json({ ok: false, error: "Failed to create or load verification session" });
    }

    if (leadId && autofill && Object.keys(autofill).length > 0) {
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
        const value = autofill[autofillKey];
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

    const { error: initErr } = await supabaseAdmin.rpc("retention_initialize_verification_items", {
      session_id_param: sessionId,
    });

    if (initErr) {
      return res.status(500).json({ ok: false, error: initErr.message });
    }

    const { data: itemsRows, error: itemsErr } = await supabaseAdmin
      .from("retention_verification_items")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (itemsErr) {
      return res.status(500).json({ ok: false, error: itemsErr.message });
    }

    const initial = (itemsRows ?? []) as Array<Record<string, unknown>>;

    if (autofill && Object.keys(autofill).length > 0) {
      if (initial.length === 0) {
        const fieldNames = Object.keys(autofill).filter((k) => k.trim().length);
        if (fieldNames.length) {
          const inserts = fieldNames.map((fieldName) => ({
            session_id: sessionId,
            field_name: fieldName,
            original_value: (autofill[fieldName] ?? "").toString(),
          }));

          const { error: seedErr } = await supabaseAdmin.from("retention_verification_items").insert(inserts);
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
          
          const autofillValue = autofill[fieldName];
          if (autofillValue && typeof autofillValue === "string" && autofillValue.trim().length > 0) {
            // For monthly_premium and coverage_amount, always update with autofill value because these should match
            // what the policy card displays, even if original_value already exists. This ensures consistency.
            const shouldUpdate = fieldName === "monthly_premium" || fieldName === "coverage_amount" || !currentOriginal || currentOriginal.trim().length === 0;
            
            if (shouldUpdate) {
              const { error: updateErr } = await supabaseAdmin
                .from("retention_verification_items")
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
      .from("retention_verification_items")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (itemsErr2) {
      return res.status(500).json({ ok: false, error: itemsErr2.message });
    }

    const finalItems = (itemsRows2 ?? []) as Array<Record<string, unknown>>;
    return res.status(200).json({ ok: true, sessionId, items: finalItems });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load verification items";
    return res.status(500).json({ ok: false, error: msg });
  }
}
