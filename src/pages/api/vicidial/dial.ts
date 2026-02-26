import type { NextApiRequest, NextApiResponse } from "next";
import { callVicidialAgentApi, type VicidialParams } from "@/lib/vicidial";

type DialRequestBody = {
  phone_number?: string;
  phone_code?: string | number;
  agent_user?: string;
  campaign_id?: string;
  lead_id?: string | number;
  list_id?: string | number;
  alt_dial?: string;
  search?: string;
  preview?: string;
  focus?: string;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse<VicidialRouteResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as DialRequestBody;
  const fn = body.vicidial_function ?? process.env.VICIDIAL_FUNCTION_DIAL ?? "external_dial";

  if (!body.phone_number) {
    return res.status(400).json({
      ok: false,
      error: "Missing required field",
      message: "phone_number is required",
    });
  }
  if (!body.agent_user) {
    return res.status(400).json({
      ok: false,
      error: "Missing required field",
      message: "agent_user is required for VICIdial agent API",
    });
  }

  try {
    const params: VicidialParams = {
      value: body.phone_number,
      phone_code: body.phone_code ?? process.env.VICIDIAL_DEFAULT_PHONE_CODE ?? "1",
      agent_user: body.agent_user,
      campaign_id: body.campaign_id,
      lead_id: body.lead_id,
      list_id: body.list_id,
      alt_dial: body.alt_dial,
      search: body.search ?? "YES",
      preview: body.preview ?? "NO",
      focus: body.focus ?? "NO",
      ...(body.extra_params ?? {}),
    };

    const result = await callVicidialAgentApi(fn, params);
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
