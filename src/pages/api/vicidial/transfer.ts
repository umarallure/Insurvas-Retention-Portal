import type { NextApiRequest, NextApiResponse } from "next";
import { callVicidialAgentApi, type VicidialParams } from "@/lib/vicidial";

type TransferRequestBody = {
  agent_user?: string;
  campaign_id?: string;
  value?: string;
  phone_number?: string;
  ingroup_choices?: string;
  vicidial_function?: string;
  extra_params?: VicidialParams;
};

type VicidialRouteResponse =
  | {
      ok: boolean;
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

  const body = (req.body ?? {}) as TransferRequestBody;
  const fn = body.vicidial_function ?? "transfer_conference";

  if (!body.agent_user) {
    return res.status(400).json({
      ok: false,
      error: "agent_user is required for VICIdial agent API",
    });
  }

  if (!body.value) {
    return res.status(400).json({
      ok: false,
      error: "value is required for transfer_conference",
    });
  }

  try {
    const params: VicidialParams = {
      agent_user: body.agent_user,
      campaign_id: body.campaign_id,
      value: body.value,
      phone_number: body.phone_number,
      ingroup_choices: body.ingroup_choices,
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
      error: "VICIdial transfer_conference request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

