import type { NextApiRequest, NextApiResponse } from "next";
import { callVicidialAgentApi, type VicidialParams } from "@/lib/vicidial";

type HangupRequestBody = {
  agent_user?: string;
  campaign_id?: string;
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
      details?: unknown;
    };

export default async function handler(req: NextApiRequest, res: NextApiResponse<VicidialRouteResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as HangupRequestBody;
  const fn = body.vicidial_function ?? process.env.VICIDIAL_FUNCTION_HANGUP ?? "external_hangup";
  if (!body.agent_user) {
    return res.status(400).json({
      ok: false,
      error: "Missing required field",
      details: "agent_user is required for VICIdial agent API",
    });
  }

  try {
    const params: VicidialParams = {
      agent_user: body.agent_user,
      value: "1",
      campaign_id: body.campaign_id,
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
