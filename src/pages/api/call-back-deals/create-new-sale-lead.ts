import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase";
import { leadPatchFromCallBackVerificationItems } from "@/lib/call-back-deals/verification-items-to-lead";

type CreateResponse =
  | { ok: true; leadId: string; submissionId: string | null }
  | { ok: false; error: string };

type CallBackDealRow = Record<string, unknown> & {
  id: string;
  name: string | null;
  phone_number: string | null;
  submission_id: string | null;
};

type LeadRow = Record<string, unknown> & {
  id: string;
  social_security: string | null;
  customer_full_name: string | null;
  created_at: string | null;
};

const RETENTION_VENDOR = "Retention BPO";

const FIELDS_TO_CLONE = [
  "customer_full_name",
  "street_address",
  "city",
  "state",
  "zip_code",
  "phone_number",
  "email",
  "date_of_birth",
  "age",
  "social_security",
  "health_conditions",
  "beneficiary_routing",
  "beneficiary_account",
  "beneficiary_information",
  "beneficiary_phone",
  "institution_name",
  "account_type",
  "birth_state",
  "driver_license",
  "existing_coverage",
  "previous_applications",
  "height",
  "weight",
  "doctors_name",
  "tobacco_use",
  "medications",
  "customer_buying_motives",
  "user_id",
  "buffer_agent",
  "agent",
] as const;

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
  return (
    [...rows].sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    })[0] ?? null
  );
}

function parseNumericOrNull(value: unknown): number | null {
  if (value == null) return null;
  const asString = typeof value === "number" ? String(value) : String(value).trim();
  if (!asString) return null;
  const cleaned = asString.replace(/[,$\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toDateOrNull(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(s);
  if (isoDate) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CreateResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing Authorization Bearer token" });
  }

  const body = (req.body ?? {}) as {
    callBackDealId?: unknown;
    quote?: unknown;
  };

  const callBackDealId =
    typeof body.callBackDealId === "string" ? body.callBackDealId.trim() : "";

  if (!callBackDealId) {
    return res.status(400).json({ ok: false, error: "callBackDealId is required" });
  }

  const quote = (body.quote ?? {}) as Record<string, unknown>;
  const carrier = typeof quote.carrier === "string" ? quote.carrier.trim() : "";
  const product = typeof quote.product === "string" ? quote.product.trim() : "";
  const coverage = parseNumericOrNull(quote.coverage);
  const monthlyPremium = parseNumericOrNull(quote.monthlyPremium);
  const draftDate = toDateOrNull(quote.draftDate);
  const notes = typeof quote.notes === "string" ? quote.notes.trim() : "";

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { data: cbd, error: cbdErr } = await supabaseAdmin
      .from("call_back_deals")
      .select("*")
      .eq("id", callBackDealId)
      .maybeSingle();

    if (cbdErr) {
      console.error("[create-new-sale-lead] callback deal lookup error", cbdErr);
      return res.status(500).json({ ok: false, error: cbdErr.message });
    }
    if (!cbd) {
      return res.status(404).json({ ok: false, error: "call_back_deals row not found" });
    }

    const callBackDeal = cbd as CallBackDealRow;

    const submissionId =
      typeof callBackDeal.submission_id === "string" ? callBackDeal.submission_id.trim() : "";
    const fullName = typeof callBackDeal.name === "string" ? callBackDeal.name.trim() : "";

    let sourceLead: LeadRow | null = null;

    if (submissionId) {
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("submission_id", submissionId)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[create-new-sale-lead] submission_id lookup failed:", error.message);
      } else if (data) {
        sourceLead = data as unknown as LeadRow;
      }
    }

    if (!sourceLead && fullName) {
      const escaped = fullName.replace(/,/g, "");
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("*")
        .ilike("customer_full_name", `%${escaped}%`)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) {
        console.warn("[create-new-sale-lead] name lookup failed:", error.message);
      } else {
        const rows = (data ?? []) as unknown as LeadRow[];
        const wantedNorm = normalizeName(fullName);
        const exactMatches = rows.filter(
          (r) => normalizeName(r.customer_full_name ?? "") === wantedNorm,
        );
        sourceLead = pickLatest(exactMatches) ?? pickLatest(rows);
      }
    }

    if (sourceLead && typeof sourceLead.social_security === "string" && sourceLead.social_security.trim().length > 0) {
      const ssn = sourceLead.social_security.trim();
      const { data: ssnRows, error: ssnErr } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("social_security", ssn)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (ssnErr) {
        console.warn("[create-new-sale-lead] SSN lookup failed:", ssnErr.message);
      } else {
        const rows = (ssnRows ?? []) as unknown as LeadRow[];
        const latest = pickLatest(rows);
        if (latest) sourceLead = latest;
      }
    }

    const { data: verificationRows, error: verificationErr } = await supabaseAdmin
      .from("call_back_deal_verification_items")
      .select("field_name, verified_value, original_value")
      .eq("call_back_deal_id", callBackDealId);

    if (verificationErr) {
      console.warn("[create-new-sale-lead] verification items load failed:", verificationErr.message);
    }

    const verificationPatch = leadPatchFromCallBackVerificationItems(
      (verificationRows ?? []) as Array<{
        field_name: string;
        verified_value: string | null;
        original_value: string | null;
      }>,
    );

    const base = (sourceLead ?? {}) as Record<string, unknown>;

    const clonedPayload: Record<string, unknown> = {};
    for (const key of FIELDS_TO_CLONE) {
      const val = base[key];
      if (val !== undefined) clonedPayload[key] = val;
    }

    if (!clonedPayload.customer_full_name && fullName) {
      clonedPayload.customer_full_name = fullName;
    }
    if (!clonedPayload.phone_number && typeof callBackDeal.phone_number === "string") {
      clonedPayload.phone_number = callBackDeal.phone_number;
    }

    Object.assign(clonedPayload, verificationPatch);

    if (carrier) clonedPayload.carrier = carrier;
    if (product) clonedPayload.product_type = product;
    if (coverage != null) clonedPayload.coverage_amount = coverage;
    if (monthlyPremium != null) clonedPayload.monthly_premium = monthlyPremium;
    if (draftDate) clonedPayload.draft_date = draftDate;

    if (notes) {
      const cur =
        typeof clonedPayload.additional_notes === "string"
          ? (clonedPayload.additional_notes as string).trim()
          : "";
      clonedPayload.additional_notes = [cur, notes].filter((s) => s.length > 0).join("\n\n");
    }

    clonedPayload.lead_vendor = RETENTION_VENDOR;
    clonedPayload.is_retention_call = true;
    clonedPayload.is_callback = false;
    clonedPayload.submission_date = new Date().toISOString();
    clonedPayload.submission_id = randomUUID();

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("leads")
      .insert(clonedPayload)
      .select("id, submission_id")
      .single();

    if (insertErr) {
      console.error("[create-new-sale-lead] insert error", insertErr);
      return res.status(500).json({ ok: false, error: insertErr.message });
    }

    const leadId = typeof inserted?.id === "string" ? inserted.id : null;
    const returnedSubmissionId =
      typeof inserted?.submission_id === "string" ? inserted.submission_id : null;

    if (!leadId) {
      return res.status(500).json({ ok: false, error: "Insert returned no id" });
    }

    return res.status(200).json({
      ok: true,
      leadId,
      submissionId: returnedSubmissionId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create new sale lead";
    console.error("[create-new-sale-lead] fatal", error);
    return res.status(500).json({ ok: false, error: msg });
  }
}
