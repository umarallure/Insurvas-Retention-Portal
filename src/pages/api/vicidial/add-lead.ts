import type { NextApiRequest, NextApiResponse } from "next";
import { callVicidialAssignmentApi, type VicidialParams } from "@/lib/vicidial";
import { buildLeadDetailsUrl, getVicidialAgentMapping } from "@/lib/vicidial-agent-mapping";

type AddLeadRequestBody = {
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  agent_profile_id?: string;
  campaign_id?: string;
  list_id?: string | number;
  deal_id?: number;
  phone_code?: string | number;
  vendor_lead_code?: string | number;
  source_id?: string | number;
  comments?: string;
  vicidial_function?: string;
  extra_params?: VicidialParams;
};

type VicidialRouteResponse =
  | {
      ok: true;
      status: number;
      function: string;
      raw: string;
      parsed: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
      message?: string;
      details?: unknown;
    };

function splitName(fullName: string | undefined, firstName: string | undefined, lastName: string | undefined) {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first || last) return { firstName: first, lastName: last };

  const normalized = (fullName ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "Unknown", lastName: "Contact" };
  const parts = normalized.split(" ");
  if (parts.length === 1) return { firstName: parts[0] ?? "Unknown", lastName: "Contact" };
  return {
    firstName: parts[0] ?? "Unknown",
    lastName: parts.slice(1).join(" ") || "Contact",
  };
}

function normalizeUsPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<VicidialRouteResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as AddLeadRequestBody;
  const fn =
    body.vicidial_function ??
    process.env.VICIDIAL_ASSIGN_FUNCTION_ADD_LEAD ??
    process.env.VICIDIAL_FUNCTION_ADD_LEAD ??
    "add_lead";

  if (!body.phone_number) {
    return res.status(400).json({
      ok: false,
      error: "Missing required field",
      message: "phone_number is required",
    });
  }

  try {
    const phoneNumber = normalizeUsPhone(body.phone_number);
    const names = splitName(body.full_name, body.first_name, body.last_name);
    const mapping = getVicidialAgentMapping(body.agent_profile_id ?? null);
    const campaignId =
      body.campaign_id ??
      mapping?.campaignId ??
      process.env.VICIDIAL_ASSIGN_DEFAULT_CAMPAIGN_ID ??
      process.env.VICIDIAL_DEFAULT_CAMPAIGN_ID;
    const listId =
      body.list_id ??
      mapping?.listId ??
      process.env.VICIDIAL_ASSIGN_DEFAULT_LIST_ID ??
      process.env.VICIDIAL_DEFAULT_LIST_ID;
    const phoneCode =
      body.phone_code ?? process.env.VICIDIAL_ASSIGN_DEFAULT_PHONE_CODE ?? process.env.VICIDIAL_DEFAULT_PHONE_CODE ?? "1";
    const webformUrl = buildLeadDetailsUrl(body.deal_id);
    const mappedUser = mapping?.vicidialUser ?? null;
    const comments = [body.comments?.trim(), webformUrl ? `Lead Details: ${webformUrl}` : null]
      .filter((v): v is string => Boolean(v && v.length))
      .join(" | ");

    const params: VicidialParams = {
      phone_number: phoneNumber,
      phone_code: phoneCode,
      first_name: names.firstName,
      last_name: names.lastName,
      campaign_id: campaignId,
      list_id: listId,
      vendor_lead_code: body.vendor_lead_code,
      source_id: body.source_id ?? body.agent_profile_id ?? mappedUser ?? null,
      comments: comments || undefined,
      ...(body.extra_params ?? {}),
    };

    const result = await callVicidialAssignmentApi(fn, params);
    const vicidialError = result.parsed.ERROR ?? (/\bERROR\b/i.test(result.raw) ? result.raw.trim() : null);

    if (vicidialError) {
      return res.status(200).json({
        ok: false,
        error: "VICIdial add_lead failed",
        details: vicidialError,
      });
    }

    return res.status(result.status).json({
      ok: result.ok,
      status: result.status,
      function: fn,
      raw: result.raw,
      parsed: result.parsed,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "VICIdial request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
